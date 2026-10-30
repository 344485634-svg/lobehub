import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import {
  DEFAULT_REFERRAL_POLICY,
  loadReferralPolicy,
} from '@/business/server/payment/fulfillPaidOrder';
import { ReferralModel } from '@/database/models/creditReferral';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const authed = wsCompatProcedure.use(serverDatabase);

export const referralRouter = router({
  overview: authed.query(async ({ ctx }) => {
    const model = new ReferralModel(ctx.serverDB, ctx.userId);
    const invite = await model.getOrCreateInviteCode();
    const bind = await model.getBind();
    const inviteeCount = await model.countInvitees();
    const rewards = await model.listRewards(20);
    const totalRewardCredits = rewards.reduce((s, r) => s + (Number(r.credits) || 0), 0);
    const policy = await loadReferralPolicy(ctx.serverDB);

    const origin =
      process.env.APP_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3010';
    const inviteLink = `${origin.replace(/\/$/, '')}/signup?ref=${encodeURIComponent(invite.code)}`;

    return {
      inviteCode: invite.code,
      inviteLink,
      inviteeCount,
      myInviterBound: !!bind,
      myInviterCode: bind?.inviteCode || null,
      policy: policy.enabled ? policy : { ...DEFAULT_REFERRAL_POLICY, enabled: false },
      rewards: rewards.map((r) => ({
        credits: r.credits,
        id: r.id,
        inviteeId: r.inviteeId,
        rate: r.rate,
        spendAmount: r.spendAmount,
        status: r.status,
        createdAt: r.createdAt,
      })),
      totalRewardCredits,
    };
  }),

  updateCode: authed
    .input(z.object({ code: z.string().min(2).max(8) }))
    .mutation(async ({ ctx, input }) => {
      const model = new ReferralModel(ctx.serverDB, ctx.userId);
      try {
        const row = await model.updateInviteCode(input.code);
        return { code: row.code };
      } catch (e: any) {
        const msg = e?.message;
        if (msg === 'INVALID_FORMAT')
          throw new TRPCError({ code: 'BAD_REQUEST', message: '邀请码格式无效（2-8位字母数字）' });
        if (msg === 'CODE_EXISTS')
          throw new TRPCError({ code: 'CONFLICT', message: '该邀请码已被占用' });
        throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message || '更新失败' });
      }
    }),

  bindCode: authed
    .input(z.object({ code: z.string().min(2).max(16) }))
    .mutation(async ({ ctx, input }) => {
      const model = new ReferralModel(ctx.serverDB, ctx.userId);
      try {
        const row = await model.bindInviteCode(input.code);
        return { inviteCode: row.inviteCode, inviterId: row.inviterId };
      } catch (e: any) {
        const msg = e?.message;
        if (msg === 'ALREADY_BOUND') return { alreadyBound: true };
        if (msg === 'INVALID_CODE')
          throw new TRPCError({ code: 'BAD_REQUEST', message: '邀请码无效' });
        if (msg === 'SELF_REFERRAL')
          throw new TRPCError({ code: 'BAD_REQUEST', message: '不能使用自己的邀请码' });
        throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message || '绑定失败' });
      }
    }),

  invitees: authed
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const model = new ReferralModel(ctx.serverDB, ctx.userId);
      const list = await model.listInvitees(input?.limit ?? 50);
      return list.map((r) => ({
        boundAt: r.boundAt,
        inviteCode: r.inviteCode,
        userId: r.userId,
      }));
    }),
});
