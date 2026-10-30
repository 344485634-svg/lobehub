import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { getCreditBalance } from '@/business/server/credits/deductCredits';
import { CNY_TO_CREDITS } from '@/business/server/payment/fulfillPaidOrder';
import { CouponModel } from '@/database/models/coupon';
import { PaymentOrderModel } from '@/database/models/paymentOrder';
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
      vendorKey = r.wasAuthentic ? r.plaintext : vendorKey;
    } catch {
      /* keep */
    }
  }
  if (terminalKey) {
    try {
      const r = await gateKeeper.decrypt(terminalKey);
      terminalKey = r.wasAuthentic ? r.plaintext : terminalKey;
    } catch {
      /* keep */
    }
  }

  return { ...cfg, terminalKey, vendorKey };
}

/** Preset top-up packages: amount CNY → credits (1:100) */
const PRESETS = [
  { amountCny: 10, credits: 1000, label: '1,000 积分' },
  { amountCny: 50, credits: 5000, label: '5,000 积分' },
  { amountCny: 100, credits: 10_000, label: '10,000 积分' },
  { amountCny: 500, credits: 50_000, label: '50,000 积分' },
];

export const topUpRouter = router({
  listPackages: authed.query(async () => {
    return {
      packages: PRESETS,
      rate: CNY_TO_CREDITS,
      rateLabel: `¥1 = ${CNY_TO_CREDITS} 积分`,
    };
  }),

  balance: authed.query(async ({ ctx }) => {
    return getCreditBalance(ctx.serverDB, ctx.userId);
  }),

  createOrder: authed
    .input(
      z.object({
        /** CNY amount, min 1 */
        amountCny: z.number().min(1).max(100_000),
        channel: z.enum(['alipay', 'wechat']).default('alipay'),
        couponCode: z.union([z.string().min(2).max(32), z.literal('')]).optional(),
        /** Signed ticket from spend.previewCoupon — preferred, more reliable than bare code */
        couponTicket: z.string().min(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let rawCoupon = (input.couponCode || '').trim().toUpperCase();
      if (!rawCoupon && input.couponTicket) {
        try {
          const { verifyCouponTicket } = await import('../payment/couponTicket');
          const amountForTicket = Math.round(Number(input.amountCny) * 100) / 100;
          rawCoupon = verifyCouponTicket(input.couponTicket, {
            amountCny: amountForTicket,
            scope: 'topup',
            userId: ctx.userId,
          }).code;
        } catch (e: any) {
          const map: Record<string, string> = {
            COUPON_SCOPE: '该优惠码不适用于积分充值',
            COUPON_TICKET_AMOUNT_MISMATCH: '优惠金额已变更，请重新验证优惠码',
            COUPON_TICKET_EXPIRED: '优惠码验证已过期，请重新点击「使用」',
            COUPON_TICKET_INVALID: '优惠码凭证无效，请重新验证',
          };
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: map[e?.message] || e?.message || '优惠码无效',
          });
        }
      }
      console.log('[topUp.createOrder] input', {
        amountCny: input.amountCny,
        channel: input.channel,
        couponCode: rawCoupon || null,
        hasTicket: !!input.couponTicket,
        userId: ctx.userId,
      });
      const amountCny = Math.round(Number(input.amountCny) * 100) / 100;
      if (!Number.isFinite(amountCny) || amountCny < 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '充值金额无效' });
      }
      // Credits always based on face value (pre-discount); coupon only reduces payment amount.
      const credits = Math.floor(amountCny * CNY_TO_CREDITS);

      let payAmount = amountCny;
      let appliedCoupon: Awaited<ReturnType<CouponModel['preview']>> | null = null;
      if (rawCoupon) {
        try {
          appliedCoupon = await new CouponModel(ctx.serverDB).preview(rawCoupon, {
            amountCny,
            scope: 'topup',
            userId: ctx.userId,
          });
          payAmount = Number(appliedCoupon.finalAmount);
          console.log('[topUp.createOrder] coupon applied', {
            code: appliedCoupon.code,
            discount: appliedCoupon.discountAmount,
            final: payAmount,
            original: amountCny,
          });
        } catch (e: any) {
          const map: Record<string, string> = {
            COUPON_EXPIRED: '优惠码已过期',
            COUPON_MIN_AMOUNT: '未达到优惠码最低消费金额',
            COUPON_NOT_FOUND: '优惠码无效',
            COUPON_NOT_STARTED: '优惠码尚未生效',
            COUPON_SCOPE: '该优惠码不适用于积分充值',
            COUPON_SOLD_OUT: '优惠码已领完',
            COUPON_USER_LIMIT: '您已使用过该优惠码',
          };
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: map[e?.message] || e?.message || '优惠码无效',
          });
        }
      }

      const sqb = await loadShouqianbaPlainConfig(ctx.serverDB);
      if (!sqb?.enabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '支付尚未开通，请联系管理员配置收钱吧',
        });
      }

      const outTradeNo = ShouqianbaClient.generateOutTradeNo('TP');
      const amount = (Math.round(Number(payAmount) * 100) / 100).toFixed(2);
      const subject = `积分充值 ${credits} 点`;

      const orderModel = new PaymentOrderModel(ctx.serverDB, ctx.userId);
      const order = await orderModel.create({
        amount,
        channel: input.channel,
        couponCode: appliedCoupon?.code,
        credits,
        currency: 'CNY',
        discountAmount: appliedCoupon ? String(appliedCoupon.discountAmount) : undefined,
        orderType: 'topup',
        originalAmount: String(amountCny),
        outTradeNo,
        planId: null as any,
        provider: 'shouqianba',
        status: 'pending',
        subject,
      } as any);

      if (appliedCoupon) {
        await new CouponModel(ctx.serverDB).redeem({
          applied: appliedCoupon,
          meta: { credits, amountCny },
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
      const returnUrl = `${origin.replace(/\/$/, '')}/settings/credits?outTradeNo=${encodeURIComponent(outTradeNo)}`;

      try {
        const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
        const configModel = new SystemConfigModel(ctx.serverDB);

        let deviceId = sqb.deviceId;
        if (!deviceId) {
          const { randomBytes } = await import('node:crypto');
          deviceId = `lobe-${randomBytes(4).toString('hex')}`;
          const currentCfg = await configModel.getShouqianbaConfig();
          if (currentCfg) {
            await configModel.setShouqianbaConfig({ ...currentCfg, deviceId } as any, ctx.userId);
          }
        }

        const tempClient = new ShouqianbaClient(sqb as any);
        const checkinResult = await tempClient.checkin(
          sqb.terminalSn,
          sqb.terminalKey!,
          deviceId,
        );
        const encryptedTerminalKey = await gateKeeper.encrypt(checkinResult.terminalKey);
        const currentCfg = await configModel.getShouqianbaConfig();
        if (currentCfg) {
          await configModel.setShouqianbaConfig(
            { ...currentCfg, terminalKey: encryptedTerminalKey } as any,
            ctx.userId,
          );
        }

        const client = new ShouqianbaClient({
          ...(sqb as any),
          terminalKey: checkinResult.terminalKey,
        });
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
          amount,
          couponCode: appliedCoupon?.code || null,
          credits,
          discountAmount: appliedCoupon?.discountAmount ?? 0,
          orderId: order.id,
          originalAmount: amountCny,
          outTradeNo,
          payUrl: result.payUrl || null,
          qrCode: result.qrCode || null,
        };
      } catch (error: any) {
        await orderModel.markFailed(order.id, error?.message || 'precreate failed');
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error?.message || '创建充值订单失败',
        });
      }
    }),
});
