import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';

import { CreditLedgerModel } from '@/database/models/creditReferral';
import { PlanModel } from '@/database/models/plan';
import { SubscriptionModel } from '@/database/models/subscription';
import { creditLedgers, userSubscriptions } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import { roundCredits } from './computeCredits';
import type { CreditChargeReason } from './types';

/** quotaUsage keys */
const PLAN_USED_KEY = 'credits'; // consumed plan credits
const TOPUP_KEY = 'topupCredits'; // top-up balance
const REWARD_KEY = 'rewardCredits'; // referral/registration reward balance

export type CreditBalance = {
  hasSubscription: boolean;
  planId?: string;
  planLimit: number;
  planRemaining: number;
  planUsed: number;
  rewardBalance: number;
  topupBalance: number;
  /** planRemaining + topupBalance + rewardBalance */
  remaining: number;
  total: number;
};

const REWARD_GRANT_REASONS = ['referral', 'registration', 'invitee_registration'];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum ledger rows for a user split into three buckets:
 * - topup: grants (topup/refund/adjust/grant) minus consumption tagged creditFrom=topup
 * - reward: grants (referral/registration) minus consumption tagged creditFrom=reward
 * - planConsumed: consumption tagged creditFrom=plan (only used as a fallback)
 * Consumption rows without a creditFrom tag are treated as topup consumption
 * (legacy rows written before the three-bucket model).
 */
export async function getLedgerBuckets(
  db: LobeChatDatabase,
  userId: string,
): Promise<{ planConsumed: number; reward: number; topup: number }> {
  const rows = await db
    .select({
      amount: creditLedgers.amount,
      creditFrom: sql<string>`coalesce(${creditLedgers.meta}->>'creditFrom','')`,
      reason: creditLedgers.reason,
    })
    .from(creditLedgers)
    .where(eq(creditLedgers.userId, userId));

  let topup = 0;
  let reward = 0;
  let planConsumed = 0;

  for (const r of rows) {
    const amount = num(r.amount);
    const from = r.creditFrom || '';
    if (amount > 0) {
      // grant
      if (REWARD_GRANT_REASONS.includes(r.reason)) reward += amount;
      else topup += amount; // topup/refund/adjust/grant
    } else {
      // consumption
      if (from === 'plan') planConsumed += -amount;
      else if (from === 'reward')
        reward += amount; // negative
      else topup += amount; // negative — legacy / topup consumption
    }
  }

  return { planConsumed, reward: Math.max(0, reward), topup: Math.max(0, topup) };
}

/**
 * For past-due subscriptions still marked 'active': flip them to 'expired' and
 * record a ledger row for the forfeited plan credits so users can see in their
 * usage history why their plan credits vanished. Top-up and reward balances
 * (user-owned) are untouched.
 */
export async function forfeitExpiredPlanCredits(
  db: LobeChatDatabase,
  userId: string,
): Promise<void> {
  const now = new Date();
  const expired = await db
    .select({
      id: userSubscriptions.id,
      planId: userSubscriptions.planId,
      quotaUsage: userSubscriptions.quotaUsage,
    })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, 'active'),
        isNotNull(userSubscriptions.expiresAt),
        lt(userSubscriptions.expiresAt, now),
      ),
    );

  if (expired.length === 0) return;

  for (const sub of expired) {
    const plan = await new PlanModel(db, userId).findById(sub.planId);
    const planLimit = num(plan?.credits ?? (plan?.quotas as Record<string, unknown>)?.credits ?? 0);
    const planUsed = num((sub.quotaUsage as Record<string, number> | null)?.credits ?? 0);
    const forfeit = Math.max(0, planLimit - planUsed);

    await db
      .update(userSubscriptions)
      .set({ status: 'expired', updatedAt: now })
      .where(eq(userSubscriptions.id, sub.id));

    if (forfeit > 0) {
      const buckets = await getLedgerBuckets(db, userId);
      const balanceAfter = Math.max(0, buckets.topup) + Math.max(0, buckets.reward);
      try {
        await new CreditLedgerModel(db, userId).insert({
          amount: -forfeit,
          balanceAfter,
          meta: {
            note: '套餐过期，剩余套餐积分作废',
            creditFrom: 'plan',
            planId: sub.planId,
            subscriptionId: sub.id,
          },
          reason: 'plan_expired',
        });
      } catch (e) {
        console.error('[credits] plan expiry ledger insert failed:', e);
      }
    }
  }
}

export async function getCreditBalance(
  db: LobeChatDatabase,
  userId: string,
): Promise<CreditBalance> {
  await forfeitExpiredPlanCredits(db, userId);
  const subModel = new SubscriptionModel(db, userId);
  const subscription = await subModel.getCurrentSubscription();

  let planLimit: number;
  let planUsed: number;
  let topupBalance: number;
  let rewardBalance: number;
  let planId: string | undefined;
  let hasSubscription = false;

  if (subscription) {
    hasSubscription = true;
    planId = subscription.planId;
    const planModel = new PlanModel(db, userId);
    const plan = await planModel.findById(subscription.planId);
    planLimit = num(plan?.credits ?? (plan?.quotas as any)?.credits ?? 0);
    const usage = (subscription.quotaUsage as Record<string, number>) || {};
    planUsed = num(usage[PLAN_USED_KEY]);
    topupBalance = Math.max(0, num(usage[TOPUP_KEY]));
    rewardBalance = Math.max(0, num(usage[REWARD_KEY]));
  } else {
    // No active subscription: derive balances from the credit ledger.
    // (Top-up/reward grants persist there even before a subscription exists;
    //  adminAssign migrates them into quotaUsage when a plan is bought.)
    const b = await getLedgerBuckets(db, userId);
    planLimit = 0;
    planUsed = 0;
    topupBalance = b.topup;
    rewardBalance = b.reward;
  }

  const planRemaining = Math.max(0, planLimit - planUsed);
  const remaining = planRemaining + topupBalance + rewardBalance;

  return {
    hasSubscription,
    planId,
    planLimit,
    planRemaining,
    planUsed,
    remaining,
    rewardBalance,
    topupBalance,
    total: planLimit + topupBalance + rewardBalance,
  };
}

export class InsufficientCreditsError extends Error {
  code = 'INSUFFICIENT_CREDITS' as const;
  constructor(message = '积分不足，请前往「设置 → 积分」充值或升级套餐') {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

async function persistUsage(
  db: LobeChatDatabase,
  userId: string,
  usage: Record<string, number>,
): Promise<void> {
  const subModel = new SubscriptionModel(db, userId);
  const subscription = await subModel.getCurrentSubscription();
  if (!subscription) return;
  await db
    .update(userSubscriptions)
    .set({
      quotaUsage: sql`${JSON.stringify(usage)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(userSubscriptions.id, subscription.id));
}

/**
 * Deduct credits in order: plan → top-up → reward.
 * Consumption ledger rows carry meta.creditFrom so the three buckets stay
 * consistent. Works with or without an active subscription.
 */
export async function deductCredits(
  db: LobeChatDatabase,
  userId: string,
  amount: number,
  meta?: {
    model?: string;
    provider?: string;
    reason?: CreditChargeReason | string;
    detail?: Record<string, unknown>;
  },
): Promise<{ deducted: number; remaining: number }> {
  const credits = roundCredits(Number(amount) || 0);
  if (credits <= 0) {
    const bal = await getCreditBalance(db, userId);
    return { deducted: 0, remaining: bal.remaining };
  }

  const bal = await getCreditBalance(db, userId);
  if (bal.remaining < credits) {
    throw new InsufficientCreditsError(
      `积分不足：本次需 ${credits} 积分，剩余 ${bal.remaining} 积分`,
    );
  }

  let left = credits;
  const consumed: { amount: number; from: 'plan' | 'reward' | 'topup' }[] = [];

  const subModel = new SubscriptionModel(db, userId);
  const subscription = await subModel.getCurrentSubscription();

  if (subscription) {
    const usage = { ...(subscription.quotaUsage as Record<string, number>) };

    // 1. plan credits
    const planRem = Math.max(0, bal.planLimit - num(usage[PLAN_USED_KEY]));
    const fromPlan = Math.min(planRem, left);
    if (fromPlan > 0) {
      usage[PLAN_USED_KEY] = num(usage[PLAN_USED_KEY]) + fromPlan;
      left -= fromPlan;
      consumed.push({ amount: fromPlan, from: 'plan' });
    }

    // 2. top-up balance
    if (left > 0) {
      const topup = Math.max(0, num(usage[TOPUP_KEY]));
      const fromTopup = Math.min(topup, left);
      if (fromTopup > 0) {
        usage[TOPUP_KEY] = topup - fromTopup;
        left -= fromTopup;
        consumed.push({ amount: fromTopup, from: 'topup' });
      }
    }

    // 3. reward balance
    if (left > 0) {
      const reward = Math.max(0, num(usage[REWARD_KEY]));
      const fromReward = Math.min(reward, left);
      if (fromReward > 0) {
        usage[REWARD_KEY] = reward - fromReward;
        consumed.push({ amount: fromReward, from: 'reward' });
      }
    }

    await persistUsage(db, userId, usage);
  } else {
    // No subscription: consume from ledger-tracked top-up then reward.
    const b = await getLedgerBuckets(db, userId);
    const fromTopup = Math.min(b.topup, left);
    if (fromTopup > 0) {
      left -= fromTopup;
      consumed.push({ amount: fromTopup, from: 'topup' });
    }
    if (left > 0) {
      const fromReward = Math.min(b.reward, left);
      if (fromReward > 0) {
        consumed.push({ amount: fromReward, from: 'reward' });
      }
    }
  }

  // Write one ledger row per source with creditFrom tag.
  const baseReason = String(meta?.reason || 'chat');
  for (const c of consumed) {
    try {
      const after = await getCreditBalance(db, userId);
      await new CreditLedgerModel(db, userId).insert({
        amount: -c.amount,
        balanceAfter: after.remaining,
        meta: {
          ...meta?.detail,
          creditFrom: c.from,
          model: meta?.model,
          provider: meta?.provider,
        },
        model: meta?.model,
        provider: meta?.provider,
        reason: baseReason,
      });
    } catch (e) {
      console.error('[credits] deduct ledger insert failed:', e);
    }
  }

  const after = await getCreditBalance(db, userId);
  return { deducted: credits, remaining: after.remaining };
}

/**
 * Grant credits into a specific bucket.
 * - reason 'topup' | 'refund' | 'adjust' | 'grant' → top-up balance
 * - reason 'referral' | 'registration' | 'invitee_registration' → reward balance
 * With an active subscription the balance is stored in quotaUsage;
 * otherwise it persists in credit_ledgers (and is migrated on subscription assign).
 */
export async function grantCredits(
  db: LobeChatDatabase,
  userId: string,
  amount: number,
  meta?: {
    reason?: string;
    detail?: Record<string, unknown>;
    model?: string;
    provider?: string;
  },
): Promise<{ remaining: number }> {
  const credits = roundCredits(Number(amount) || 0);
  if (credits <= 0) {
    const bal = await getCreditBalance(db, userId);
    return { remaining: bal.remaining };
  }

  const bucket = REWARD_GRANT_REASONS.includes(String(meta?.reason || '')) ? REWARD_KEY : TOPUP_KEY;

  const subModel = new SubscriptionModel(db, userId);
  const subscription = await subModel.getCurrentSubscription();
  if (subscription) {
    const usage = { ...(subscription.quotaUsage as Record<string, number>) };
    usage[bucket] = Math.max(0, num(usage[bucket])) + credits;
    await persistUsage(db, userId, usage);
  }

  // Ledger is always written (source of truth for no-subscription balances).
  try {
    await new CreditLedgerModel(db, userId).insert({
      amount: credits,
      meta: {
        ...meta?.detail,
        creditFrom: bucket === REWARD_KEY ? 'reward' : 'topup',
        model: meta?.model,
        provider: meta?.provider,
      },
      model: meta?.model,
      provider: meta?.provider,
      reason: String(meta?.reason || 'grant'),
    });
  } catch (e) {
    console.error('[credits] grantCredits ledger insert failed:', e);
  }

  const after = await getCreditBalance(db, userId);
  return { remaining: after.remaining };
}

/**
 * Admin / system manual adjustment (positive = add, negative = subtract).
 * Negative amounts are deducted following plan → top-up → reward order.
 */
export async function adjustCredits(
  db: LobeChatDatabase,
  userId: string,
  amount: number,
  meta?: { reason?: string; note?: string },
): Promise<{ remaining: number }> {
  const delta = roundCredits(Number(amount) || 0);
  if (delta > 0) {
    return grantCredits(db, userId, delta, {
      detail: { note: meta?.note },
      reason: 'adjust',
    });
  }
  if (delta < 0) {
    await deductCredits(db, userId, -delta, {
      detail: { note: meta?.note },
      reason: 'adjust',
    });
    const after = await getCreditBalance(db, userId);
    return { remaining: after.remaining };
  }
  const bal = await getCreditBalance(db, userId);
  return { remaining: bal.remaining };
}

export async function refundCredits(
  db: LobeChatDatabase,
  userId: string,
  amount: number,
): Promise<void> {
  const credits = roundCredits(Number(amount) || 0);
  if (credits <= 0) return;
  await grantCredits(db, userId, credits, { reason: 'refund' });
}

/** Migrate ledger-tracked top-up/reward balances into a fresh subscription's quotaUsage. */
export async function migrateLedgerToSubscription(
  db: LobeChatDatabase,
  userId: string,
): Promise<void> {
  const subModel = new SubscriptionModel(db, userId);
  const subscription = await subModel.getCurrentSubscription();
  if (!subscription) return;

  const b = await getLedgerBuckets(db, userId);
  const usage = { ...(subscription.quotaUsage as Record<string, number>) };
  if (b.topup > 0) usage[TOPUP_KEY] = Math.max(num(usage[TOPUP_KEY]), b.topup);
  if (b.reward > 0) usage[REWARD_KEY] = Math.max(num(usage[REWARD_KEY]), b.reward);
  await persistUsage(db, userId, usage);
}
