import { asyncTasks } from '@lobechat/database/schemas';
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { withScopedPermission } from '@/business/server/trpc-middlewares/rbacPermission';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { refundPrechargedTaskOnce } from '@/business/server/video-generation/refundPrechargedTask';
import { AsyncTaskModel } from '@/database/models/asyncTask';
import { GenerationModel } from '@/database/models/generation';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { FileService } from '@/server/services/file';
import { processBackgroundVideoPolling } from '@/server/services/generation/videoBackgroundPolling';
import { type AsyncTaskError } from '@/types/asyncTask';
import { AsyncTaskStatus, AsyncTaskType } from '@/types/asyncTask';
import { type Generation } from '@/types/generation';

// 断点续跑判定:心跳超过 3 分钟未刷新 → 认定轮询进程已死
const RESUME_STALE_MS = 3 * 60 * 1000;
// 单次续跑预算 30 分钟 + 5 分钟缓冲;超过后允许再次续跑(resumedAt 重臂窗口)
const RESUME_REARM_MS = 35 * 60 * 1000;

const generationProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const wsId = ctx.workspaceId ?? undefined;

  return opts.next({
    ctx: {
      asyncTaskModel: new AsyncTaskModel(ctx.serverDB, ctx.userId, wsId),
      fileService: new FileService(ctx.serverDB, ctx.userId, wsId),
      generationModel: new GenerationModel(ctx.serverDB, ctx.userId, wsId),
    },
  });
});

export type GetGenerationStatusResult = {
  error: AsyncTaskError | null;
  generation: Generation | null;
  status: AsyncTaskStatus;
};

export const generationRouter = router({
  deleteGeneration: generationProcedure
    .use(withScopedPermission('file:delete'))
    .input(z.object({ generationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Delete the generation record from database and get the deleted data
      const deletedGeneration = await ctx.generationModel.delete(input.generationId);

      if (!deletedGeneration) return;

      // Note: Based on new requirements, don't delete main file (fileId), only delete thumbnail
      // If generation has a thumbnail, delete it from S3
      if (deletedGeneration.asset) {
        const asset = deletedGeneration.asset as any;

        // Only delete thumbnail URL if exists
        if (asset.thumbnailUrl) {
          await ctx.fileService.deleteFile(asset.thumbnailUrl);
        }
      }

      return deletedGeneration;
    }),

  getGenerationStatus: generationProcedure
    .input(z.object({ asyncTaskId: z.string(), generationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check for timeout tasks before querying
      await ctx.asyncTaskModel.checkTimeoutTasks([input.asyncTaskId]);

      const asyncTask = await ctx.asyncTaskModel.findById(input.asyncTaskId);
      if (!asyncTask) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Async task not found' });
      }

      // 断点续跑:视频轮询跑在应用进程内,容器重启会把在途轮询直接杀掉,
      // 任务从此僵在 processing(无人翻转状态)。
      // 判定依据=心跳停跳:轮询循环每 10 秒刷新 updatedAt,超过 RESUME_STALE
      // 未刷新即认定进程已死。用原子 claim(带 resumedAt 重臂窗口)保证多端
      // 同时打开页面也只拉起一个续跑进程。
      const staleMs = Date.now() - new Date(asyncTask.updatedAt).getTime();
      if (
        asyncTask.status === AsyncTaskStatus.Processing &&
        asyncTask.type === AsyncTaskType.VideoGeneration &&
        asyncTask.inferenceId &&
        staleMs > RESUME_STALE_MS
      ) {
        const claim = await ctx.serverDB
          .update(asyncTasks)
          .set({
            metadata: sql`jsonb_set(coalesce(${asyncTasks.metadata}, '{}'::jsonb), '{resumedAt}', ${JSON.stringify(new Date().toISOString())}::jsonb)`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(asyncTasks.id, input.asyncTaskId),
              eq(asyncTasks.status, AsyncTaskStatus.Processing),
              sql`(${asyncTasks.metadata}->>'resumedAt') is null or (${asyncTasks.metadata}->>'resumedAt') < ${new Date(Date.now() - RESUME_REARM_MS).toISOString()}`,
            ),
          )
          .returning({ id: asyncTasks.id });

        if (claim.length > 0) {
          const generation = await ctx.serverDB.query.generations.findFirst({
            where: (gens, { eq: eqFn }) => eqFn(gens.id, input.generationId),
          });
          const batch = generation
            ? await ctx.serverDB.query.generationBatches.findFirst({
                where: (batches, { eq: eqFn }) => eqFn(batches.id, generation.generationBatchId),
              })
            : undefined;

          if (generation && batch) {
            // fire-and-forget:页面继续用当前 query 正常轮询,不打断响应
            void processBackgroundVideoPolling(ctx.serverDB, {
              asyncTaskCreatedAt: asyncTask.createdAt,
              asyncTaskId: input.asyncTaskId,
              generationBatchId: batch.id,
              generationId: input.generationId,
              generationTopicId: batch.generationTopicId,
              inferenceId: asyncTask.inferenceId,
              model: batch.model,
              prechargeResult: (asyncTask.metadata as Record<string, any>)?.precharge,
              provider: batch.provider,
              userId: ctx.userId,
              workspaceId: ctx.workspaceId ?? undefined,
            }).catch((e) => console.error('[generation] resume video polling failed:', e));
          }
        }
      }

      const { status, error } = asyncTask;
      const result: GetGenerationStatusResult = {
        error: null,
        generation: null,
        status: status as AsyncTaskStatus,
      };

      if (asyncTask.status === AsyncTaskStatus.Success) {
        const generation = await ctx.generationModel.findByIdAndTransform(input.generationId);
        if (!generation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Generation not found' });
        }

        result.generation = generation;
      } else if (asyncTask.status === AsyncTaskStatus.Error) {
        result.error = error as AsyncTaskError;
        // The timeout check above can fail a task outside the async route's
        // error path — make sure its precharge is refunded (exactly once).
        await refundPrechargedTaskOnce(ctx.serverDB, ctx.userId, asyncTask);
      }

      return result;
    }),
});

export type GenerationRouter = typeof generationRouter;
