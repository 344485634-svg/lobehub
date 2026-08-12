import { ASYNC_TASK_TIMEOUT } from '@lobechat/business-config/server';
import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';
import {
  buildMappedBusinessModelFields,
  resolveBusinessModelMapping,
} from '@lobechat/business-model-runtime';
import { type CreateImageMethodOptions } from '@lobechat/model-runtime';
import { AsyncTaskError, AsyncTaskStatus, RequestTrigger } from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { type RuntimeImageGenParams } from 'model-bank';
import { z } from 'zod';

import { getProviderContentPolicyErrorMessage } from '@/business/server/getProviderContentPolicyErrorMessage';
import { chargeAfterGenerate } from '@/business/server/image-generation/chargeAfterGenerate';
import { notifyImageCompleted } from '@/business/server/image-generation/notifyImageCompleted';
import { createImageBusinessMiddleware } from '@/business/server/trpc-middlewares/async';
import { AsyncTaskModel } from '@/database/models/asyncTask';
import { FileModel } from '@/database/models/file';
import { GenerationModel } from '@/database/models/generation';
import { GenerationBatchModel } from '@/database/models/generationBatch';
import { asyncAuthedProcedure, asyncRouter as router } from '@/libs/trpc/async';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { GenerationService } from '@/server/services/generation';
import { sanitizeFileName } from '@/utils/sanitizeFileName';

import { categorizeImageGenerationError } from './imageError';

const log = debug('lobe-image:async');

const IMAGE_URL_PREVIEW_LENGTH = 100;

const imageProcedure = asyncAuthedProcedure.use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: {
      asyncTaskModel: new AsyncTaskModel(ctx.serverDB, ctx.userId),
      fileModel: new FileModel(ctx.serverDB, ctx.userId),
      generationBatchModel: new GenerationBatchModel(ctx.serverDB, ctx.userId),
      generationModel: new GenerationModel(ctx.serverDB, ctx.userId),
      generationService: new GenerationService(ctx.serverDB, ctx.userId),
    },
  });
});

const createImageInputSchema = z.object({
  generationBatchId: z.string(),
  generationId: z.string(),
  generationTopicId: z.string(),
  model: z.string(),
  params: z
    .object({
      cfg: z.number().optional(),
      height: z.number().optional(),
      imageUrls: z.array(z.string()).optional(),
      prompt: z.string(),
      seed: z.number().nullish(),
      steps: z.number().optional(),
      width: z.number().optional(),
    })
    .passthrough(),
  provider: z.string(),
  taskId: z.string(),
  workspaceId: z.string().optional(),
});

/**
 * Checks if the abort signal has been triggered and throws an error if so
 */
const checkAbortSignal = (signal: AbortSignal) => {
  if (signal.aborted) {
    throw new Error('Operation was aborted');
  }
};

export const imageRouter = router({
  createImage: imageProcedure
    .use(createImageBusinessMiddleware)
    .input(createImageInputSchema)
    .mutation(async ({ input, ctx }) => {
      const {
        taskId,
        generationId,
        generationBatchId,
        generationTopicId,
        provider,
        model,
        params,
        workspaceId,
      } = input;
      const asyncTaskModel = new AsyncTaskModel(ctx.serverDB, ctx.userId, workspaceId);
      const generationBatchModel = new GenerationBatchModel(ctx.serverDB, ctx.userId, workspaceId);
      const generationModel = new GenerationModel(ctx.serverDB, ctx.userId, workspaceId);
      const generationService = new GenerationService(ctx.serverDB, ctx.userId, workspaceId);

      log('Starting async image generation: %O', {
        generationId,
        imageParams: {
          cfg: params.cfg,
          height: params.height,
          steps: params.steps,
          width: params.width,
        },
        model,
        prompt: params.prompt,
        provider,
        taskId,
      });

      // Check if generationBatch exists before processing
      const generationBatch = await generationBatchModel.findById(generationBatchId);
      if (!generationBatch) {
        log('Generation batch not found: %s, skipping image generation', generationBatchId);
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid Request!' });
      }

      log('Updating task status to Processing: %s', taskId);
      await asyncTaskModel.update(taskId, { status: AsyncTaskStatus.Processing });

      // Use AbortController to prevent resource leaks
      const abortController = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      // Heartbeat: refresh updatedAt periodically while the task is still
      // Processing so the timeout checker (based on updatedAt staleness) doesn't
      // mis-mark a long-running image generation as TaskTimeout. The outer
      // ASYNC_TASK_TIMEOUT timer remains the real kill switch.
      const heartbeatId = setInterval(() => {
        void asyncTaskModel.update(taskId, { status: AsyncTaskStatus.Processing }).catch(() => {});
      }, 60_000);

      const isEditingImage =
        Boolean((params as any).imageUrl) ||
        Boolean(params.imageUrls && params.imageUrls.length > 0);

      try {
        const imageGenerationPromise = async (signal: AbortSignal) => {
          log('Initializing agent runtime for provider: %s', provider);
          const { requestedModelId, resolvedModelId } = await resolveBusinessModelMapping(
            provider,
            model,
          );

          // Read user's provider config from database
          const modelRuntime = await initModelRuntimeFromDB(
            ctx.serverDB,
            ctx.userId,
            provider,
            workspaceId,
          );

          // Check if operation has been cancelled
          checkAbortSignal(signal);
          log('Agent runtime initialized, calling createImage');
          const runtimeOptions: CreateImageMethodOptions = {
            metadata: {
              generationBatchId,
              generationId,
              taskId,
              trigger: RequestTrigger.Image,
            },
          };
          const response = await modelRuntime.createImage!(
            {
              model: resolvedModelId,
              params: params as unknown as RuntimeImageGenParams,
            },
            runtimeOptions,
          );

          if (!response) {
            log('Create image response is empty');
            throw new Error('Create image response is empty');
          }

          log('Create image response: %O', {
            ...response,
            imageUrl: response.imageUrl?.startsWith('data:')
              ? response.imageUrl.slice(0, IMAGE_URL_PREVIEW_LENGTH) + '...'
              : response.imageUrl,
          });

          const { modelUsage } = response;

          log('Image generation successful: %O', {
            height: response.height,
            imageUrl: response.imageUrl.startsWith('data:')
              ? response.imageUrl.slice(0, IMAGE_URL_PREVIEW_LENGTH) + '...'
              : response.imageUrl,
            width: response.width,
          });

          log('Transforming image for generation');
          const { imageUrl, width, height } = response;

          // Extract ComfyUI authentication headers if provider is ComfyUI
          let authHeaders: Record<string, string> | undefined;
          if (provider === 'comfyui') {
            // Use the public interface method to get auth headers
            // This avoids accessing private members and exposing credentials
            authHeaders = modelRuntime.getAuthHeaders();
            if (authHeaders) {
              log('Using authentication headers for ComfyUI image download');
            } else {
              log('No authentication configured for ComfyUI');
            }
          }

          // Download the generated image and re-upload to our own storage. The
          // asset URL must be a storage key — the frontend resolves it via
          // getFullFileUrl, which only understands our own S3 keys. If the
          // download fails (dead CDN node, unsupported blob: scheme, …) we let
          // the task fail with a clear error instead of faking success with an
          // unresolvable external URL.
          const { image, thumbnailImage } = await generationService.transformImageForGeneration(
            imageUrl,
            authHeaders,
          );

          log('Uploading image for generation');
          const uploadResult = await generationService.uploadImageForGeneration(
            image,
            thumbnailImage,
          );
          const uploadedImageUrl = uploadResult.imageUrl;
          const thumbnailImageUrl = uploadResult.thumbnailImageUrl;

          const assetHeight = height ?? image.height;
          const assetWidth = width ?? image.width;
          const assetMetaHeight = image.height;
          const assetMetaWidth = image.width;
          const fileHash = image.hash;
          const fileType = image.mime;
          const fileSize = image.size;
          const fileExtension = image.extension;

          checkAbortSignal(signal);

          log('Updating generation asset and file');
          await generationModel.createAssetAndFile(
            generationId,
            {
              height: assetHeight,
              originalUrl: imageUrl.startsWith('data:') ? uploadedImageUrl : imageUrl,
              thumbnailUrl: thumbnailImageUrl,
              type: 'image',
              url: uploadedImageUrl,
              width: assetWidth,
            },
            {
              fileHash,
              fileType,
              metadata: {
                generationId,
                height: assetMetaHeight,
                path: uploadedImageUrl,
                width: assetMetaWidth,
              },
              name: `${sanitizeFileName(params.prompt, generationId)}.${fileExtension}`,
              size: fileSize,
              url: uploadedImageUrl,
            },
          );

          const duration = Date.now() - generationBatch.createdAt.getTime();

          log('Updating task status to Success: %s, duration: %dms', taskId, duration);
          await asyncTaskModel.update(taskId, {
            duration,
            status: AsyncTaskStatus.Success,
          });

          try {
            await notifyImageCompleted({
              duration,
              generationBatchId,
              model,
              prompt: params.prompt,
              topicId: generationTopicId,
              userId: ctx.userId,
            });
          } catch (err) {
            console.error('[image-async] notification failed:', err);
          }

          if (ENABLE_BUSINESS_FEATURES) {
            await chargeAfterGenerate({
              metrics: { latency: duration },
              metadata: {
                asyncTaskId: taskId,
                generationBatchId,
                topicId: generationTopicId,
                ...buildMappedBusinessModelFields({
                  provider,
                  requestedModelId,
                  resolvedModelId,
                }),
              },
              modelUsage,
              pricingContext: runtimeOptions.pricingContext,
              provider,
              serverDB: ctx.serverDB,
              userId: ctx.userId,
              workspaceId,
            });
          }

          log('Async image generation completed successfully: %s', taskId);
          return { success: true };
        };

        // Set timeout to cancel operation and prevent resource leaks
        timeoutId = setTimeout(() => {
          log('Image generation timeout, aborting operation: %s', taskId);
          abortController.abort();
        }, ASYNC_TASK_TIMEOUT);

        const result = await imageGenerationPromise(abortController.signal);

        // Clean up timeout timer
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        clearInterval(heartbeatId);

        return result;
      } catch (error: any) {
        // Clean up timeout timer
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        clearInterval(heartbeatId);

        log('Async image generation failed: %O', {
          error: error.message || error,
          generationId,
          taskId,
        });

        // Improved error categorization logic
        const providerContentPolicyMessage = await getProviderContentPolicyErrorMessage({
          error,
          provider,
          trigger: RequestTrigger.Image,
          userId: ctx.userId,
        });
        const { errorType, errorMessage } = categorizeImageGenerationError({
          error,
          isEditingImage,
          isAborted: abortController.signal.aborted,
          providerContentPolicyMessage,
        });

        await asyncTaskModel.update(taskId, {
          error: new AsyncTaskError(errorType, errorMessage),
          status: AsyncTaskStatus.Error,
        });

        log('Task status updated to Error: %s, errorType: %s', taskId, errorType);

        // Refund precharged image credits on failure
        try {
          const task = await asyncTaskModel.findById(taskId);
          const precharge = (task as any)?.metadata?.precharge;
          if (precharge?.amount) {
            await chargeAfterGenerate({
              isError: true,
              metadata: {
                asyncTaskId: taskId,
                generationBatchId,
                topicId: generationTopicId,
                modelId: model,
              },
              prechargeResult: precharge,
              provider,
              serverDB: ctx.serverDB,
              userId: ctx.userId,
              workspaceId,
            });
          }
        } catch (refundError) {
          console.error('[image-async] Failed to refund precharge on error:', refundError);
        }

        return {
          message: `Image generation ${taskId} failed: ${errorMessage}`,
          success: false,
        };
      }
    }),
});
