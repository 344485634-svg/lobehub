import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AgentSkillModel } from '@/database/models/agentSkill';
import { ApiKeyModel } from '@/database/models/apiKey';
import { UserModel } from '@/database/models/user';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const adminProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const currentUser = await UserModel.findById(ctx.serverDB, ctx.userId);
  if (!currentUser || currentUser.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return opts.next();
});

const assertNotSelf = (targetUserId: string, currentUserId: string) => {
  if (targetUserId === currentUserId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot act on your own account' });
  }
};

export const adminRouter = router({
  banUser: adminProcedure
    .input(z.object({ expiresAt: z.string().optional(), reason: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({
        banExpires: input.expiresAt ? new Date(input.expiresAt) : null,
        banReason: input.reason,
        banned: true,
      });
      return { success: true as const };
    }),

  deleteApiKey: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ApiKeyModel.adminDelete(ctx.serverDB, input.id);
      return { success: true as const };
    }),

  deleteSkill: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return AgentSkillModel.adminDelete(ctx.serverDB, input.id);
    }),

  getUserDetail: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const detail = await UserModel.getUserDetailById(ctx.serverDB, input.userId);
      if (!detail) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return detail;
    }),

  listUsers: adminProcedure
    .input(
      z.object({
        bannedOnly: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return UserModel.listUsers(ctx.serverDB, input);
    }),

  listAllApiKeys: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ApiKeyModel.adminListAll(ctx.serverDB, input);
    }),

  listAllSkills: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        source: z.enum(['builtin', 'market', 'user']).optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return AgentSkillModel.adminListAll(ctx.serverDB, input);
    }),

  unbanUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({ banExpires: null, banReason: null, banned: false });
      return { success: true as const };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ role: z.enum(['admin', 'user']), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({ role: input.role });
      return { success: true as const };
    }),

  updateApiKey: adminProcedure
    .input(
      z.object({
        id: z.string(),
        value: z.object({
          enabled: z.boolean().optional(),
          expiresAt: z.date().nullish(),
          name: z.string().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ApiKeyModel.adminUpdate(ctx.serverDB, input.id, input.value);
      return { success: true as const };
    }),
});
