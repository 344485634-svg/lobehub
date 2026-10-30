import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { grantCredits } from '@/business/server/credits/deductCredits';
import { CreditLedgerModel, ReferralModel } from '@/database/models/creditReferral';
import { PaymentOrderModel } from '@/database/models/paymentOrder';
import { PlanModel } from '@/database/models/plan';
import { SubscriptionModel } from '@/database/models/subscription';
import { SystemConfigModel } from '@/database/models/systemConfig';
import type { ReferralPolicyConfig } from '@/database/schemas/systemConfig';
import { SYSTEM_CONFIG_KEYS } from '@/database/schemas/systemConfig';

/** ¥1 = 100 credits */
export const CNY_TO_CREDITS = 100;

/** Default policy: disabled until admin configures it */
export const DEFAULT_REFERRAL_POLICY: ReferralPolicyConfig = {
  defaultRate: 0,
  enabled: false,
  inviteeRegistrationCredits: 0,
  registrationCredits: 0,
  tiers: [],
};

export async function loadReferralPolicy(db: any): Promise<ReferralPolicyConfig> {
  try {
    const model = new SystemConfigModel(db);
    const cfg = await model.get<ReferralPolicyConfig>(SYSTEM_CONFIG_KEYS.referral);
    if (!cfg) return DEFAULT_REFERRAL_POLICY;
    return {
      defaultRate: Number(cfg.defaultRate) || 0,
      enabled: cfg.enabled !== false,
      inviteeRegistrationCredits: Number(cfg.inviteeRegistrationCredits) || 0,
      registrationCredits: Number(cfg.registrationCredits) || 0,
      tiers: Array.isArray(cfg.tiers) ? cfg.tiers : [],
    };
  } catch {
    return DEFAULT_REFERRAL_POLICY;
  }
}

export function pickReferralRate(policy: ReferralPolicyConfig, spendCny: number): number {
  const tiers = [...(policy.tiers || [])].sort((a, b) => b.minAmount - a.minAmount);
  for (const t of tiers) {
    if (spendCny >= Number(t.minAmount || 0)) return Number(t.rate) || 0;
  }
  return Number(policy.defaultRate) || 0;
}

/** Credits reward for inviter from invitee spend (CNY). */
export function computeReferralCredits(spendCny: number, rate: number): number {
  if (spendCny <= 0 || rate <= 0) return 0;
  // spend * rate (money rebate) * 100 (money→credits)
  return Math.floor(spendCny * rate * CNY_TO_CREDITS);
}

/**
 * Fulfill paid order: subscription assign OR top-up grant + referral reward.
 */
export async function fulfillPaidOrder(
  db: any,
  orderId: string,
  opts: { notifyRaw?: Record<string, unknown>; tradeNo?: string },
) {
  const orderModel = new PaymentOrderModel(db);
  const paid = await orderModel.markPaid(orderId, opts);
  if (!paid) return orderModel.findById(orderId);

  const orderType = (paid as any).orderType || 'subscription';
  const amountCny = Number(paid.amount) || 0;

  if (orderType === 'topup') {
    const credits =
      Number((paid as any).credits) || Math.floor(amountCny * CNY_TO_CREDITS);
    if (credits > 0) {
      await grantCredits(db, paid.userId, credits, {
        detail: { orderId: paid.id, outTradeNo: paid.outTradeNo, amountCny },
        reason: 'topup',
      });
    }
  } else {
    // subscription
    if (paid.planId) {
      const planModel = new PlanModel(db, paid.userId);
      const plan = await planModel.findById(paid.planId);
      if (plan) {
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

        // 迁移无订阅期间 ledger 中的充值/奖励积分到新订阅的 quotaUsage，
        // 避免「先充值、后买订阅」导致充值积分从余额中消失。
        try {
          const { migrateLedgerToSubscription } = await import(
            '@/business/server/credits/deductCredits'
          );
          await migrateLedgerToSubscription(db, paid.userId);
        } catch (e) {
          console.error('[fulfillPaidOrder] migrate ledger failed:', e);
        }

        // grant plan credits as ledger note (balance already from plan.credits)
        if (Number(plan.credits) > 0) {
          try {
            await new CreditLedgerModel(db, paid.userId).insert({
              amount: Number(plan.credits),
              meta: { orderId: paid.id, planId: plan.id },
              reason: 'plan_grant',
            });
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  // Level-1 referral rebate on invitee's paid spend
  try {
    const policy = await loadReferralPolicy(db);
    if (policy.enabled && amountCny > 0) {
      const bind = await ReferralModel.findInviterOf(db, paid.userId);
      if (bind?.inviterId) {
        const rate = pickReferralRate(policy, amountCny);
        const reward = computeReferralCredits(amountCny, rate);
        if (reward > 0) {
          await ReferralModel.grantReward(db, {
            credits: reward,
            inviteeId: paid.userId,
            inviterId: bind.inviterId,
            orderId: paid.id,
            rate,
            spendAmount: String(amountCny),
          });
          await grantCredits(db, bind.inviterId, reward, {
            detail: {
              inviteeId: paid.userId,
              orderId: paid.id,
              rate,
              spendAmount: amountCny,
            },
            reason: 'referral',
          });
        }
      }
    }
  } catch (e) {
    console.error('[referral] reward failed', e);
  }

  return paid;
}

// re-export zod helper unused
void z;
void TRPCError;
