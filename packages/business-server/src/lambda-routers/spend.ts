import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { getCreditBalance } from '@/business/server/credits/deductCredits';
import { CouponModel } from '@/database/models/coupon';
import { CreditLedgerModel } from '@/database/models/creditReferral';
import { PaymentOrderModel } from '@/database/models/paymentOrder';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

const authed = wsCompatProcedure.use(serverDatabase);

export const spendRouter = router({
  /** Credit consumption / grant ledger (usage detail) */
  creditLedger: authed
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const model = new CreditLedgerModel(ctx.serverDB, ctx.userId);
      const rows = await model.list(input?.limit ?? 50);
      return rows.map((r) => ({
        amount: r.amount,
        balanceAfter: r.balanceAfter,
        createdAt: r.createdAt,
        id: r.id,
        meta: r.meta,
        model: r.model,
        provider: r.provider,
        reason: r.reason,
      }));
    }),

  balance: authed.query(async ({ ctx }) => getCreditBalance(ctx.serverDB, ctx.userId)),

  /** Payment orders (subscription + top-up) for billing page */
  paymentOrders: authed
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const model = new PaymentOrderModel(ctx.serverDB, ctx.userId);
      const rows = await model.listMine(input?.limit ?? 30);
      return rows.map((o) => ({
        amount: o.amount,
        channel: o.channel,
        createdAt: o.createdAt,
        credits: (o as any).credits ?? null,
        currency: o.currency,
        id: o.id,
        orderType: (o as any).orderType || 'subscription',
        outTradeNo: o.outTradeNo,
        paidAt: o.paidAt,
        planId: o.planId,
        status: o.status,
        subject: o.subject,
        tradeNo: o.tradeNo,
      }));
    }),

  previewCoupon: authed
    .input(
      z.object({
        amountCny: z.number().positive(),
        code: z.string().min(2).max(32),
        scope: z.enum(['subscription', 'topup']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const applied = await new CouponModel(ctx.serverDB).preview(input.code, {
          amountCny: input.amountCny,
          scope: input.scope,
          userId: ctx.userId,
        });
        const { signCouponTicket } = await import('../payment/couponTicket');
        const ticket = signCouponTicket({
          amountCny: input.amountCny,
          code: applied.code,
          exp: Date.now() + 15 * 60 * 1000,
          scope: input.scope,
          userId: ctx.userId,
        });
        return { ...applied, ticket };
      } catch (e: any) {
        const map: Record<string, string> = {
          COUPON_EXPIRED: '优惠码已过期',
          COUPON_MIN_AMOUNT: '未达到优惠码最低消费金额',
          COUPON_NOT_FOUND: '优惠码无效',
          COUPON_NOT_STARTED: '优惠码尚未生效',
          COUPON_SCOPE: '该优惠码不适用于当前订单类型',
          COUPON_SOLD_OUT: '优惠码已领完',
          COUPON_USER_LIMIT: '您已使用过该优惠码',
        };
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: map[e?.message] || e?.message || '优惠码无效',
        });
      }
    }),

});
