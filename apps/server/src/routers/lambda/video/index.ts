import { randomBytes } from 'node:crypto';

import { BRANDING_PROVIDER } from '@lobechat/business-const';
import { isLobeHubModelAvailable } from '@lobechat/business-model-bank/model-config';
import { resolveBusinessModelMapping } from '@lobechat/business-model-runtime';
import { ChatErrorType, RequestTrigger } from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { and, eq } from 'drizzle-orm';
import { after } from 'next/server';
import { z } from 'zod';

import { getProviderContentPolicyErrorMessage } from '@/business/server/getProviderContentPolicyErrorMessage';
import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { chargeBeforeGenerate } from '@/business/server/video-generation/chargeBeforeGenerate';
import { getVideoFreeQuota } from '@/business/server/video-generation/getVideoFreeQuota';
import { refundPrechargedTaskOnce } from '@/business/server/video-generation/refundPrechargedTask';
import { AsyncTaskModel } from '@/database/models/asyncTask';
import { GenerationTopicModel } from '@/database/models/generationTopic';
import { UserModel } from '@/database/models/user';
import {
  asyncTasks,
  generationBatches,
  generations,
  type NewGeneration,
  type NewGenerationBatch,
} from '@/database/schemas';
import { getServerDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { FileService } from '@/server/services/file';
import { fetchImageFromUrl } from '@/server/services/generation';
import { processBackgroundVideoPolling } from '@/server/services/generation/videoBackgroundPolling';
import {
  loadImageHostPlainConfig,
  uploadImageToImageHost,
} from '@/server/services/storage/imageHost';
import { AsyncTaskStatus, AsyncTaskType } from '@/types/asyncTask';

import { createVideoTaskSubmitError } from './error';

const log = debug('lobe-video:lambda');

const videoProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const wsId = ctx.workspaceId ?? undefined;

  return opts.next({
    ctx: {
      asyncTaskModel: new AsyncTaskModel(ctx.serverDB, ctx.userId, wsId),
      fileService: new FileService(ctx.serverDB, ctx.userId, wsId),
      generationTopicModel: new GenerationTopicModel(ctx.serverDB, ctx.userId, wsId),
    },
  });
});

const videoCreateProcedure = videoProcedure.use(withScopedPermission('file:upload'));

const createVideoInputSchema = z.object({
  generationTopicId: z.string(),
  model: z.string(),
  params: z
    .object({
      aspectRatio: z.string().optional(),
      cameraFixed: z.boolean().optional(),
      duration: z.number().optional(),
      endImageUrl: z.string().nullish(),
      generateAudio: z.boolean().optional(),
      imageUrl: z.string().nullish(),
      prompt: z.string(),
      resolution: z.string().optional(),
      seed: z.number().nullish(),
    })
    .passthrough(),
  provider: z.string(),
});
export type CreateVideoServicePayload = z.infer<typeof createVideoInputSchema>;

export const videoRouter = router({
  createVideo: videoCreateProcedure
    .input(createVideoInputSchema)
    .mutation(async ({ input, ctx }) => {
      {
        const { checkModelAccess } = await import('@/business/server/checkModelAccess');
        const denied = await checkModelAccess(
          ctx.serverDB,
          ctx.userId,
          input.provider,
          input.model,
        );
        if (denied) throw new TRPCError({ code: 'FORBIDDEN', message: denied });
      }

      const { userId, serverDB, asyncTaskModel, fileService, generationTopicModel } = ctx;
      const wsId = ctx.workspaceId ?? undefined;
      const { generationTopicId, provider, model, params } = input;

      const { resolvedModelId } = await resolveBusinessModelMapping(provider, model);

      // Reject lobehub model ids that are no longer in the model bank so callers get a
      // clear error instead of an opaque downstream failure when the resolved channel
      // model is no longer in the model bank.
      if (
        provider === BRANDING_PROVIDER &&
        !(await isLobeHubModelAvailable(resolvedModelId, 'video', {
          getUserEmail: async () => (await UserModel.findById(serverDB, userId))?.email,
        }))
      ) {
        throw new TRPCError({
          cause: { data: { modelType: 'video', requestedModel: model } },
          code: 'BAD_REQUEST',
          message: ChatErrorType.LobeHubModelDeprecated,
        });
      }

      log('Starting video creation process, input: %O', input);

      // Normalize image URLs to S3 keys for database storage
      let configForDatabase = { ...params };

      // Process first-frame imageUrl
      if (typeof params.imageUrl === 'string' && params.imageUrl) {
        try {
          const key = await fileService.getKeyFromFullUrl(params.imageUrl);
          if (key) {
            log('Converted imageUrl to key: %s -> %s', params.imageUrl, key);
            configForDatabase = { ...configForDatabase, imageUrl: key };
          }
        } catch (error) {
          console.error('Error converting imageUrl to key: %O', error);
        }
      }

      // Process last-frame endImageUrl
      if (typeof params.endImageUrl === 'string' && params.endImageUrl) {
        try {
          const key = await fileService.getKeyFromFullUrl(params.endImageUrl);
          if (key) {
            log('Converted endImageUrl to key: %s -> %s', params.endImageUrl, key);
            configForDatabase = { ...configForDatabase, endImageUrl: key };
          }
        } catch (error) {
          console.error('Error converting endImageUrl to key: %O', error);
        }
      }

      // Process multi reference images / mediaUrl if present
      if (Array.isArray((params as any).imageUrls) && (params as any).imageUrls.length > 0) {
        try {
          const keys = await Promise.all(
            ((params as any).imageUrls as string[]).map(async (url) => {
              try {
                return (await fileService.getKeyFromFullUrl(url)) || url;
              } catch {
                return url;
              }
            }),
          );
          configForDatabase = { ...configForDatabase, imageUrls: keys };
        } catch (error) {
          console.error('Error converting imageUrls to keys: %O', error);
        }
      }
      if (typeof (params as any).mediaUrl === 'string' && (params as any).mediaUrl) {
        try {
          const key = await fileService.getKeyFromFullUrl((params as any).mediaUrl);
          if (key) {
            configForDatabase = { ...configForDatabase, mediaUrl: key };
          }
        } catch (error) {
          console.error('Error converting mediaUrl to key: %O', error);
        }
      }

      // Step 0: Pre-charge (atomic budget deduction to prevent concurrent abuse)
      const generationTopic = await generationTopicModel.findById(generationTopicId);
      if (!generationTopic) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid generation topic' });
      }

      let prechargeResult: Record<string, unknown> | undefined;
      try {
        const charge = await chargeBeforeGenerate({
          generationTopicId,
          model,
          params,
          provider,
          serverDB,
          userId,
          workspaceId: wsId,
        });
        if (charge.errorBatch) return charge.errorBatch;
        prechargeResult = charge.prechargeResult as any;
      } catch (e: any) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: e?.message || '积分不足，无法生成视频',
        });
      }

      // Generate a one-time token for webhook callback verification
      const webhookToken = randomBytes(32).toString('hex');

      // Step 1: Atomically create all database records in a transaction
      const {
        asyncTaskCreatedAt,
        asyncTaskId,
        batch: createdBatch,
        generation: createdGeneration,
      } = await serverDB.transaction(async (tx) => {
        log('Starting database transaction for video generation');

        // 1. Create generationBatch
        const newBatch: NewGenerationBatch = {
          config: configForDatabase,
          generationTopicId,
          model,
          prompt: params.prompt,
          provider,
          userId,
          workspaceId: wsId,
        };
        log('Creating generation batch: %O', newBatch);
        const [batch] = await tx.insert(generationBatches).values(newBatch).returning();
        log('Generation batch created: %s', batch.id);

        // 2. Create single generation (video is always 1)
        const newGeneration: NewGeneration = {
          generationBatchId: batch.id,
          seed: params.seed ?? null,
          userId,
          workspaceId: wsId,
        };
        const [generation] = await tx.insert(generations).values(newGeneration).returning();
        log('Generation created: %s', generation.id);

        // 3. Create asyncTask with precharge metadata
        const [asyncTask] = await tx
          .insert(asyncTasks)
          .values({
            metadata: {
              ...(prechargeResult ? { precharge: prechargeResult } : {}),
              webhookToken,
            },
            status: AsyncTaskStatus.Pending,
            type: AsyncTaskType.VideoGeneration,
            userId,
            workspaceId: wsId,
          })
          .returning();
        log('Async task created: %s', asyncTask.id);

        // 4. Link asyncTask to generation
        await tx
          .update(generations)
          .set({ asyncTaskId: asyncTask.id })
          .where(and(eq(generations.id, generation.id), eq(generations.userId, userId)));

        return {
          asyncTaskCreatedAt: asyncTask.createdAt,
          asyncTaskId: asyncTask.id,
          batch,
          generation,
        };
      });

      log(
        'Database transaction completed. Returning batch to the client; submitting in background.',
      );

      // Step 2 runs in after(): media-URL resolution re-hosts non-public
      // reference images on the configured image host (a multi-second upload)
      // and the gateway round-trip adds more. The mutation returns as soon as
      // the DB records exist so the client can render the batch immediately;
      // failures surface as task errors (with precharge refund) in the feed.
      after(async () => {
        let generationParams = params;
        try {
          // Resolve stored keys / proxy URLs to full URLs the model gateway can
          // fetch. Remote gateways (api.liuma.ai) require media_url to be valid
          // HTTP(S) — non-public references get re-hosted on the image host.
          {
            const updates: Record<string, unknown> = {};

            // True when a remote gateway can download this URL directly — public
            // http(s), not localhost/intranet (mirrors model-runtime's isPublicHttpUrl).
            const isGatewayFetchableUrl = (url: string): boolean => {
              if (!/^https?:\/\//i.test(url)) return false;
              try {
                const host = new URL(url).hostname.toLowerCase();
                return !(
                  host === 'localhost' ||
                  host === '127.0.0.1' ||
                  host === '0.0.0.0' ||
                  host === '::1' ||
                  host.endsWith('.local') ||
                  host.startsWith('10.') ||
                  host.startsWith('192.168.') ||
                  /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
                );
              } catch {
                return false;
              }
            };

            const resolvePublic = async (value: unknown): Promise<string | undefined> => {
              if (typeof value !== 'string' || !value) return undefined;
              if (value.startsWith('data:')) return undefined;
              if (isGatewayFetchableUrl(value)) return value;
              try {
                const full = await fileService.getFullFileUrl(value);
                return full || undefined;
              } catch {
                return undefined;
              }
            };

            // Lazy: only hit the DB when a reference URL actually needs re-hosting.
            let imageHost: Awaited<ReturnType<typeof loadImageHostPlainConfig>> | undefined;
            let imageHostChecked = false;
            const getImageHost = async () => {
              if (!imageHostChecked) {
                imageHostChecked = true;
                imageHost = await loadImageHostPlainConfig(serverDB).catch(() => undefined);
              }
              return imageHost;
            };

            // When the resolved URL is still not gateway-fetchable (local
            // S3/presigned URLs, /f/ proxy paths, inline data: URIs) re-host the
            // image on the admin-configured public image host. No-op when no
            // image host is configured — model-runtime then falls back to base64
            // and the gateway rejects it with its own error, same as before.
            const ensurePublicRefUrl = async (value: unknown): Promise<string | undefined> => {
              const resolved = await resolvePublic(value);
              if (resolved && isGatewayFetchableUrl(resolved)) return resolved;

              const src = typeof value === 'string' && value.startsWith('data:') ? value : resolved;
              if (!src || !(await getImageHost())) return resolved;

              let buffer: Buffer;
              let mime: string | undefined;
              if (src.startsWith('data:')) {
                ({ buffer, mimeType: mime } = await fetchImageFromUrl(src));
              } else {
                // Our own storage object — read bytes directly instead of
                // fetching over HTTP (ssrfSafeFetch would block the localhost
                // S3 endpoint).
                const key = await fileService.getKeyFromFullUrl(src);
                if (key) {
                  buffer = Buffer.from(await fileService.getFileByteArray(key));
                  const meta = await fileService.getFileMetadata(key).catch(() => undefined);
                  if (meta?.contentType?.startsWith('image/')) mime = meta.contentType;
                } else {
                  ({ buffer, mimeType: mime } = await fetchImageFromUrl(src));
                }
              }
              const url = await uploadImageToImageHost(serverDB, { buffer, mime });
              log('Re-hosted non-public reference image: %s', url);
              return url;
            };

            if (typeof params.imageUrl === 'string' && params.imageUrl) {
              const url = await ensurePublicRefUrl(configForDatabase.imageUrl ?? params.imageUrl);
              if (url) updates.imageUrl = url;
            }
            if (typeof params.endImageUrl === 'string' && params.endImageUrl) {
              const url = await ensurePublicRefUrl(
                configForDatabase.endImageUrl ?? params.endImageUrl,
              );
              if (url) updates.endImageUrl = url;
            }
            if (Array.isArray((params as any).imageUrls) && (params as any).imageUrls.length > 0) {
              const src = ((configForDatabase as any).imageUrls ??
                (params as any).imageUrls) as string[];
              const urls = (
                await Promise.all(src.map(async (v) => (await ensurePublicRefUrl(v)) || v))
              ).filter(Boolean);
              if (urls.length) updates.imageUrls = urls;
            }
            // mediaUrl is a video reference — image hosts don't accept videos, so just resolve it.
            if (typeof (params as any).mediaUrl === 'string' && (params as any).mediaUrl) {
              const url = await resolvePublic(
                (configForDatabase as any).mediaUrl ?? (params as any).mediaUrl,
              );
              if (url) updates.mediaUrl = url;
            }

            if (Object.keys(updates).length > 0) {
              generationParams = { ...params, ...updates };
              log('Resolved media URLs for gateway: %O', updates);
            }
          }

          const modelRuntime = await initModelRuntimeFromDB(serverDB, userId, provider, wsId);

          const callbackBaseUrl = process.env.WEBHOOK_PROXY_URL || appEnv.APP_URL;
          const callbackUrl = `${callbackBaseUrl}/api/webhooks/video/${provider}?token=${webhookToken}`;
          log('Using callback URL: %s', callbackUrl);

          const response = await modelRuntime.createVideo(
            {
              callbackUrl,
              model: resolvedModelId,
              params: generationParams,
            },
            { metadata: { trigger: RequestTrigger.Video } },
          );

          log('Video task submitted successfully, inferenceId: %s', response?.inferenceId);

          // Determine async strategy based on response:
          // - useWebhook: provider registered a callback URL, wait for webhook
          // - otherwise: poll the gateway inline (we are already in after())
          const useWebhook = response && 'useWebhook' in response && response.useWebhook;

          await asyncTaskModel.update(asyncTaskId, {
            inferenceId: response?.inferenceId,
            status: AsyncTaskStatus.Processing,
          });

          if (!useWebhook && response?.inferenceId) {
            log('Polling-based provider detected, polling inline for task: %s', asyncTaskId);
            const db = await getServerDB();

            await processBackgroundVideoPolling(db, {
              asyncTaskCreatedAt,
              asyncTaskId,
              generationBatchId: createdBatch.id,
              generationId: createdGeneration.id,
              generationTopicId,
              inferenceId: response.inferenceId,
              model,
              prechargeResult,
              provider,
              userId,
              workspaceId: wsId,
            });

            log('Background video polling completed for task: %s', asyncTaskId);
          }
        } catch (e) {
          console.error('Failed to submit video generation task:', e);

          const providerContentPolicyMessage = await getProviderContentPolicyErrorMessage({
            error: e,
            provider,
            trigger: RequestTrigger.Video,
            userId,
          });
          await asyncTaskModel.update(asyncTaskId, {
            error: createVideoTaskSubmitError(e, providerContentPolicyMessage),
            status: AsyncTaskStatus.Error,
          });

          if (prechargeResult) {
            try {
              const refunded = await refundPrechargedTaskOnce(serverDB, userId, {
                id: asyncTaskId,
                metadata: { precharge: prechargeResult },
              });
              if (refunded) log('Precharge refunded after submit failure: %s', asyncTaskId);
            } catch (chargeError) {
              console.error('[video] precharge refund failed:', chargeError);
            }
          }
        }
      });

      log('Video creation process completed: %O', {
        batchId: createdBatch.id,
        generationId: createdGeneration.id,
      });

      return {
        data: {
          batch: createdBatch,
          generations: [{ ...createdGeneration, asyncTaskId }],
        },
        success: true,
      };
    }),

  getVideoFreeQuota: authedProcedure
    .input(z.object({ model: z.string() }))
    .query(async ({ ctx, input }) => {
      return getVideoFreeQuota(ctx.userId, input.model);
    }),
});

export type VideoRouter = typeof videoRouter;
