import { randomBytes } from 'node:crypto';

import { BRANDING_PROVIDER } from '@lobechat/business-const';
import { isLobeHubModelAvailable } from '@lobechat/business-model-bank/model-config';
import {
  buildMappedBusinessModelFields,
  resolveBusinessModelMapping,
} from '@lobechat/business-model-runtime';
import { ChatErrorType, RequestTrigger } from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { and, eq } from 'drizzle-orm';
import { after } from 'next/server';
import { z } from 'zod';

import { getProviderContentPolicyErrorMessage } from '@/business/server/getProviderContentPolicyErrorMessage';
import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { chargeAfterGenerate } from '@/business/server/video-generation/chargeAfterGenerate';
import { chargeBeforeGenerate } from '@/business/server/video-generation/chargeBeforeGenerate';
import { getVideoFreeQuota } from '@/business/server/video-generation/getVideoFreeQuota';
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
import { processBackgroundVideoPolling } from '@/server/services/generation/videoBackgroundPolling';
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
      const { getSubscriptionPlan } = await import('@/business/server/user');
      const { Plans } = await import('@lobechat/types');
      const { AiModelModel } = await import('@/database/models/aiModel');
      const plan = await getSubscriptionPlan(ctx.userId);
      const isFree = !plan || plan === Plans.Free;
      const providerId = (input as any).provider;
      const modelId = (input as any).model;
      if (isFree && providerId && modelId) {
        let creditsPerRequest = 0;
        try {
          const m = await new AiModelModel(ctx.serverDB, ctx.userId).findByIdAndProvider(
            modelId,
            providerId,
          );
          if (m) creditsPerRequest = Number((m.pricing as any)?.creditsPerRequest ?? 0) || 0;
          if (!m) {
            const { eq: eq2 } = await import('drizzle-orm');
            const { users: usersTable } = await import('@/database/schemas');
            const admins = await ctx.serverDB
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq2(usersTable.role, 'admin'))
              .limit(3);
            for (const a of admins) {
              const am = await new AiModelModel(ctx.serverDB, a.id).findByIdAndProvider(
                modelId,
                providerId,
              );
              if (am) {
                creditsPerRequest = Number((am.pricing as any)?.creditsPerRequest ?? 0) || 0;
                break;
              }
            }
          }
        } catch {}
        if (creditsPerRequest > 0) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '积分不足：当前视频模型需订阅套餐后使用，请前往「设置 → 订阅套餐」开通。',
          });
        }
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

      // Convert stored keys / proxy URLs to full URLs the model gateway can fetch.
      // Remote gateways (api.liuma.ai) require media_url to be valid HTTP(S).
      // Always resolve through fileService so localhost proxy URLs become S3/public URLs
      // when available (not only in development).
      let generationParams = params;
      {
        const updates: Record<string, unknown> = {};
        const resolvePublic = async (value: unknown): Promise<string | undefined> => {
          if (typeof value !== 'string' || !value) return undefined;
          // Already a public http(s) URL that is not localhost/proxy — keep
          if (/^https?:\/\//i.test(value) && !/localhost|127\.0\.0\.1/.test(value)) {
            return value;
          }
          try {
            const full = await fileService.getFullFileUrl(value);
            return full || undefined;
          } catch {
            return undefined;
          }
        };

        if (typeof params.imageUrl === 'string' && params.imageUrl) {
          const url = await resolvePublic(configForDatabase.imageUrl ?? params.imageUrl);
          if (url) updates.imageUrl = url;
        }
        if (typeof params.endImageUrl === 'string' && params.endImageUrl) {
          const url = await resolvePublic(configForDatabase.endImageUrl ?? params.endImageUrl);
          if (url) updates.endImageUrl = url;
        }
        if (Array.isArray((params as any).imageUrls) && (params as any).imageUrls.length > 0) {
          const src = ((configForDatabase as any).imageUrls ??
            (params as any).imageUrls) as string[];
          const urls = (
            await Promise.all(src.map(async (v) => (await resolvePublic(v)) || v))
          ).filter(Boolean);
          if (urls.length) updates.imageUrls = urls;
        }
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

      // Step 0: Pre-charge (atomic budget deduction to prevent concurrent abuse)
      const generationTopic = await generationTopicModel.findById(generationTopicId);
      if (!generationTopic) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid generation topic' });
      }

      const { errorBatch, prechargeResult } = await chargeBeforeGenerate({
        generationTopicId,
        model,
        params,
        provider,
        userId,
        workspaceId: wsId,
      });
      if (errorBatch) return errorBatch;

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

      log('Database transaction completed. Calling model runtime for video generation.');

      // Step 2: Call model runtime to submit video generation task
      try {
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
        // - otherwise: use background polling to check status
        const useWebhook = response && 'useWebhook' in response && response.useWebhook;

        if (useWebhook) {
          // Webhook-based provider (e.g. Volcengine): wait for callback
          log('Webhook-based provider detected, waiting for callback');

          await asyncTaskModel.update(asyncTaskId, {
            inferenceId: response?.inferenceId,
            status: AsyncTaskStatus.Processing,
          });
        } else if (response) {
          // Polling-based provider (e.g. OpenAI Sora): use background polling
          log(
            'Polling-based provider detected (inferenceId only), using after() for background polling',
          );

          await asyncTaskModel.update(asyncTaskId, {
            inferenceId: response.inferenceId,
            status: AsyncTaskStatus.Processing,
          });

          after(async () => {
            log('After() hook executing background video polling for task: %s', asyncTaskId);

            try {
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
            } catch (error) {
              console.error('[video] Background polling failed:', error);
            }
          });

          log('After() hook registered for background video polling: %s', asyncTaskId);
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
            await chargeAfterGenerate({
              isError: true,
              metadata: {
                asyncTaskId,
                generationBatchId: createdBatch.id,
                topicId: generationTopicId,
                ...buildMappedBusinessModelFields({
                  provider,
                  requestedModelId: resolvedModelId === model ? undefined : model,
                  resolvedModelId,
                }),
              },
              model: resolvedModelId,
              prechargeResult,
              provider,
              userId,
              workspaceId: wsId,
            });
          } catch (chargeError) {
            console.error('[video] chargeAfterGenerate failed:', chargeError);
          }
        }
      }

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
