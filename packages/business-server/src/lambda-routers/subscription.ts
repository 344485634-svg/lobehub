import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { CouponModel } from '@/database/models/coupon';
import { PaymentOrderModel } from '@/database/models/paymentOrder';
import { PlanModel } from '@/database/models/plan';
import { SubscriptionModel } from '@/database/models/subscription';
import { SystemConfigModel } from '@/database/models/systemConfig';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { ShouqianbaClient } from '@/server/services/payment/shouqianba';

import { fulfillPaidOrder } from '../payment/fulfillPaidOrder';

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
      vendorKey = r.wasAuthentic ? r.plaintext : vendorKey;
    } catch {
      // 解密失败则保留加密值
    }
  }
  if (terminalKey) {
    try {
      const r = await gateKeeper.decrypt(terminalKey);
      terminalKey = r.wasAuthentic ? r.plaintext : terminalKey;
    } catch {
      // 解密失败则保留加密值
    }
  }

  return { ...cfg, terminalKey, vendorKey };
}

/** Mark order paid + assign subscription / top-up / referral (idempotent) */
export { fulfillPaidOrder } from '../payment/fulfillPaidOrder';

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
    const planModel = new PlanModel(ctx.serverDB, ctx.userId);

    if (current) {
      const plan = await planModel.findById(current.planId);
      return {
        lastExpiredPlan: null,
        lastExpiredSubscription: null,
        plan: plan || null,
        subscription: current,
      };
    }

    // No active subscription: surface the most recent expired one so the UI can
    // tell a lapsed subscriber (套餐已过期 + renew) from a brand-new user.
    const lastExpired = await subModel.getLatestExpiredSubscription();
    if (lastExpired) {
      const lastExpiredPlan = await planModel.findById(lastExpired.planId);
      return {
        lastExpiredPlan: lastExpiredPlan || null,
        lastExpiredSubscription: lastExpired,
        plan: null,
        subscription: null,
      };
    }

    return {
      lastExpiredPlan: null,
      lastExpiredSubscription: null,
      plan: null,
      subscription: null,
    };
  }),

  createOrder: authed
    .input(
      z.object({
        billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
        channel: z.enum(['alipay', 'wechat', 'unionpay']).default('alipay'),
        couponCode: z.string().min(2).max(32).optional(),
        couponTicket: z.string().min(10).optional(),
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
      let amountNum = price;
      let appliedCoupon: Awaited<ReturnType<CouponModel['preview']>> | null = null;
      let couponToUse = (input.couponCode || '').trim().toUpperCase();
      if (!couponToUse && input.couponTicket) {
        try {
          const { verifyCouponTicket } = await import('../payment/couponTicket');
          couponToUse = verifyCouponTicket(input.couponTicket, {
            amountCny: amountNum,
            scope: 'subscription',
            userId: ctx.userId,
          }).code;
        } catch (e: any) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              e?.message === 'COUPON_TICKET_EXPIRED'
                ? '优惠码验证已过期，请重新点击「使用」'
                : '优惠码凭证无效，请重新验证',
          });
        }
      }
      if (couponToUse) {
        try {
          appliedCoupon = await new CouponModel(ctx.serverDB).preview(couponToUse, {
            amountCny: amountNum,
            scope: 'subscription',
            userId: ctx.userId,
          });
          amountNum = appliedCoupon.finalAmount;
        } catch (e: any) {
          const map: Record<string, string> = {
            COUPON_EXPIRED: '优惠码已过期',
            COUPON_MIN_AMOUNT: '未达到优惠码最低消费金额',
            COUPON_NOT_FOUND: '优惠码无效',
            COUPON_NOT_STARTED: '优惠码尚未生效',
            COUPON_SCOPE: '该优惠码不适用于套餐订阅',
            COUPON_SOLD_OUT: '优惠码已领完',
            COUPON_USER_LIMIT: '您已使用过该优惠码',
          };
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: map[e?.message] || e?.message || '优惠码无效',
          });
        }
      }
      const amount = amountNum.toFixed(2);
      const subject = `${plan.displayName || plan.name}（${input.billingCycle === 'yearly' ? '年付' : '月付'}）`;

      const orderModel = new PaymentOrderModel(ctx.serverDB, ctx.userId);
      const order = await orderModel.create({
        amount,
        channel: input.channel,
        couponCode: appliedCoupon?.code,
        currency: 'CNY',
        discountAmount: appliedCoupon ? String(appliedCoupon.discountAmount) : undefined,
        orderType: 'subscription',
        originalAmount: appliedCoupon ? String(appliedCoupon.originalAmount) : String(price),
        outTradeNo,
        planId: plan.id,
        provider: 'shouqianba',
        status: 'pending',
        subject,
      } as any);

      if (appliedCoupon) {
        await new CouponModel(ctx.serverDB).redeem({
          applied: appliedCoupon,
          meta: { planId: plan.id, billingCycle: input.billingCycle },
          orderId: order.id,
          userId: ctx.userId,
        });
      }

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
        const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
        const configModel = new SystemConfigModel(ctx.serverDB);

        // 若 deviceId 缺失（旧激活记录），生成并持久化一个新的
        let deviceId = sqb.deviceId;
        if (!deviceId) {
          const { randomBytes } = await import('node:crypto');
          deviceId = `lobe-${randomBytes(4).toString('hex')}`;
          const currentCfg = await configModel.getShouqianbaConfig();
          if (currentCfg) {
            await configModel.setShouqianbaConfig({ ...currentCfg, deviceId } as any, ctx.userId);
          }
        }

        // 每日首次交易前 check-in，获取当日有效 terminal_key
        const tempClient = new ShouqianbaClient(sqb);
        const checkinResult = await tempClient.checkin(sqb.terminalSn, sqb.terminalKey!, deviceId);

        // 加密并保存新的 terminal_key 到数据库
        const encryptedTerminalKey = await gateKeeper.encrypt(checkinResult.terminalKey);
        const currentCfg = await configModel.getShouqianbaConfig();
        if (currentCfg) {
          await configModel.setShouqianbaConfig(
            {
              ...currentCfg,
              terminalKey: encryptedTerminalKey,
            } as any,
            ctx.userId,
          );
        }

        // 用刷新后的 terminal_key 创建订单
        const client = new ShouqianbaClient({ ...sqb, terminalKey: checkinResult.terminalKey });
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

      // 回调兜底：订单仍 pending 时，主动向收钱吧查询真实支付状态。
      // 回调地址若为 localhost/不可公网访问，收钱吧无法回调，这里保证到账。
      if (order.status === 'pending' && order.provider === 'shouqianba') {
        try {
          const sqb = await loadShouqianbaPlainConfig(ctx.serverDB);
          if (sqb?.enabled) {
            const client = new ShouqianbaClient(sqb as any);
            const query = await client.queryOrder(order.outTradeNo);
            const statusStr = String(
              query?.orderStatus || query?.status || query?.tradeStatus || '',
            ).toUpperCase();
            const paidLike =
              statusStr === 'PAID' ||
              statusStr === 'SUCCESS' ||
              statusStr === 'PAY_SUCCESS' ||
              statusStr === 'TRADE_SUCCESS' ||
              statusStr === '2' ||
              statusStr === 'PAYSUCCESS';
            if (paidLike) {
              await fulfillPaidOrder(ctx.serverDB, order.id, {
                notifyRaw: query?.raw || {},
                tradeNo: query?.sn || order.tradeNo || undefined,
              });
            }
          }
        } catch (e) {
          // 主动查询失败不应阻断正常读取，仅记录
          console.error('[getOrder] shouqianba query fallback failed:', e);
        }
      }

      return orderModel.findByOutTradeNo(input.outTradeNo);
    }),

  myOrders: authed
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const orderModel = new PaymentOrderModel(ctx.serverDB, ctx.userId);
      return orderModel.listMine(input?.limit ?? 20);
    }),
});
