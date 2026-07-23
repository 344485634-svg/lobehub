import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { PaymentOrderModel } from '@/database/models/paymentOrder';
import { PlanModel } from '@/database/models/plan';
import { SubscriptionModel } from '@/database/models/subscription';
import { SystemConfigModel } from '@/database/models/systemConfig';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { ShouqianbaClient } from '@/server/services/payment/shouqianba';

const authed = wsCompatProcedure.use(serverDatabase);

async function loadShouqianbaPlainConfig(db: any) {
  const model = new SystemConfigModel(db);
  const cfg = await model.getShouqianbaConfig();
  if (!cfg) return undefined;

  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  let vendorKey = cfg.vendorKey;
  let terminalKey = cfg.terminalKey;

  if (vendorKey) {
    try {
      const r = await gateKeeper.decrypt(vendorKey);
      if (r.wasAuthentic) vendorKey = r.plaintext;
    } catch {
      /* keep */
    }
  }
  if (terminalKey) {
    try {
      const r = await gateKeeper.decrypt(terminalKey);
      if (r.wasAuthentic) terminalKey = r.plaintext;
    } catch {
      /* keep */
    }
  }

  return { ...cfg, terminalKey, vendorKey };
}

/** Mark order paid + assign subscription (idempotent) */
export async function fulfillPaidOrder(
  db: any,
  orderId: string,
  opts: { notifyRaw?: Record<string, unknown>; tradeNo?: string },
) {
  const orderModel = new PaymentOrderModel(db);
  const paid = await orderModel.markPaid(orderId, opts);
  if (!paid) return orderModel.findById(orderId);

  const planModel = new PlanModel(db, paid.userId);
  const plan = await planModel.findById(paid.planId);
  if (!plan) return paid;

  let expiresAt: Date | null = null;
  if (plan.billingCycle === 'monthly') {
    expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  } else if (plan.billingCycle === 'yearly') {
    expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  }

  await SubscriptionModel.adminAssign(db, {
    assignedBy: paid.userId,
    expiresAt,
    notes: `支付订单 ${paid.outTradeNo} 自动开通`,
    planId: plan.id,
    userId: paid.userId,
  });

  return paid;
}

export const subscriptionRouter = router({
  listPlans: authed.query(async ({ ctx }) => {
    const { plans } = await PlanModel.adminList(ctx.serverDB, {
      activeOnly: true,
      page: 1,
      pageSize: 50,
    });
    return plans.map((p) => ({
      allowedModels: p.allowedModels || [],
      badge: p.badge,
      benefits: p.benefits || [],
      billingCycle: p.billingCycle,
      credits: p.credits ?? 0,
      description: p.description,
      displayName: p.displayName,
      features: p.features,
      highlight: p.highlight,
      id: p.id,
      monthlyOriginalPrice: p.monthlyOriginalPrice,
      monthlyPrice: p.monthlyPrice || p.price,
      name: p.name,
      price: p.monthlyPrice || p.price,
      quotas: p.quotas,
      sortOrder: p.sortOrder,
      yearlyOriginalPrice: p.yearlyOriginalPrice,
      yearlyPrice: p.yearlyPrice,
    }));
  }),

  mySubscription: authed.query(async ({ ctx }) => {
    const subModel = new SubscriptionModel(ctx.serverDB, ctx.userId);
    const current = await subModel.getCurrentSubscription();
    if (!current) return { plan: null, subscription: null };

    const planModel = new PlanModel(ctx.serverDB, ctx.userId);
    const plan = await planModel.findById(current.planId);
    return { plan: plan || null, subscription: current };
  }),

  createOrder: authed
    .input(
      z.object({
        billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
        channel: z.enum(['alipay', 'wechat', 'unionpay']).default('alipay'),
        planId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const planModel = new PlanModel(ctx.serverDB, ctx.userId);
      const plan = await planModel.findById(input.planId);
      if (!plan || !plan.active) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '套餐不存在或未上架' });
      }

      const price = Number(
        input.billingCycle === 'yearly'
          ? plan.yearlyPrice || plan.price
          : plan.monthlyPrice || plan.price,
      );
      if (!Number.isFinite(price) || price < 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '套餐价格无效' });
      }

      if (price === 0) {
        await SubscriptionModel.adminAssign(ctx.serverDB, {
          assignedBy: ctx.userId,
          expiresAt:
            input.billingCycle === 'yearly'
              ? new Date(Date.now() + 365 * 24 * 3600 * 1000)
              : new Date(Date.now() + 30 * 24 * 3600 * 1000),
          notes: '免费套餐自动开通',
          planId: plan.id,
          userId: ctx.userId,
        });
        return {
          freeActivated: true as const,
          orderId: null,
          outTradeNo: null,
          payUrl: null,
          qrCode: null,
        };
      }

      const sqb = await loadShouqianbaPlainConfig(ctx.serverDB);
      if (!sqb?.enabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '支付尚未开通，请联系管理员在后台配置收钱吧',
        });
      }

      const outTradeNo = ShouqianbaClient.generateOutTradeNo('LH');
      const amount = price.toFixed(2);
      const subject = `${plan.displayName || plan.name}（${input.billingCycle === 'yearly' ? '年付' : '月付'}）`;

      const orderModel = new PaymentOrderModel(ctx.serverDB, ctx.userId);
      const order = await orderModel.create({
        amount,
        channel: input.channel,
        currency: 'CNY',
        outTradeNo,
        planId: plan.id,
        provider: 'shouqianba',
        status: 'pending',
        subject,
      });

      const origin =
        process.env.APP_URL ||
        process.env.NEXTAUTH_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'http://localhost:3010';

      const notifyUrl =
        sqb.notifyUrl || `${origin.replace(/\/$/, '')}/webapi/payment/shouqianba/notify`;
      const returnUrl =
        sqb.returnUrl ||
        `${origin.replace(/\/$/, '')}/settings/plans?outTradeNo=${encodeURIComponent(outTradeNo)}`;

      try {
        const client = new ShouqianbaClient(sqb);
        const result = await client.precreate({
          amount,
          channel: input.channel,
          notifyUrl,
          outTradeNo,
          returnUrl,
          subject,
        });

        await orderModel.updatePayPayload(order.id, result.raw || {}, result.tradeNo);

        return {
          freeActivated: false as const,
          orderId: order.id,
          outTradeNo,
          payUrl: result.payUrl || null,
          qrCode: result.qrCode || null,
        };
      } catch (error: any) {
        await orderModel.markFailed(order.id, error?.message || 'precreate failed');
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error?.message || '创建支付订单失败',
        });
      }
    }),

  getOrder: authed
    .input(z.object({ mockPay: z.boolean().optional(), outTradeNo: z.string() }))
    .query(async ({ ctx, input }) => {
      const orderModel = new PaymentOrderModel(ctx.serverDB, ctx.userId);
      const order = await orderModel.findByOutTradeNo(input.outTradeNo);
      if (!order || order.userId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '订单不存在' });
      }

      if (input.mockPay && order.status === 'pending') {
        const sqb = await loadShouqianbaPlainConfig(ctx.serverDB);
        const isMock =
          order.payPayload &&
          typeof order.payPayload === 'object' &&
          (order.payPayload as any).mock;
        if (sqb?.env === 'sandbox' || isMock) {
          await fulfillPaidOrder(ctx.serverDB, order.id, {
            notifyRaw: { mockPay: true },
            tradeNo: order.tradeNo || `MOCKPAY${Date.now()}`,
          });
          return orderModel.findByOutTradeNo(input.outTradeNo);
        }
      }

      return order;
    }),

  myOrders: authed
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const orderModel = new PaymentOrderModel(ctx.serverDB, ctx.userId);
      return orderModel.listMine(input?.limit ?? 20);
    }),
});
