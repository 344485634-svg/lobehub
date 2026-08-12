import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

import { subscriptionPlans, userSubscriptions } from '@/database/schemas';
import type { PlanAllowedModel } from '@/database/schemas/subscriptionPlan';
import type { LobeChatDatabase } from '@/database/type';

import { roundCredits } from './computeCredits';

/**
 * Returns the discount rate for a given model within the user's active plan.
 * Returns 1.0 if no active plan, model not found in plan, or no discount configured.
 * Range: 0.01–1.0 (e.g. 0.8 = 8折 = 20% off)
 */
export async function loadPlanDiscountRate(
  db: LobeChatDatabase,
  userId: string,
  providerId: string,
  modelId: string,
): Promise<number> {
  try {
    const [row] = await db
      .select({ allowedModels: subscriptionPlans.allowedModels })
      .from(userSubscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, userSubscriptions.planId))
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, 'active'),
          // skip subscriptions whose term has ended, even if the status column
          // hasn't been lazily flipped to 'expired' yet
          or(isNull(userSubscriptions.expiresAt), gt(userSubscriptions.expiresAt, new Date())),
        ),
      )
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);

    if (!row?.allowedModels) return 1;

    const models = row.allowedModels as PlanAllowedModel[];
    const match = models.find((m) => m.providerId === providerId && m.modelId === modelId);
    if (!match) return 1;

    const rate = Number(match.discountRate);
    if (!rate || rate <= 0 || rate > 1) return 1;
    return rate;
  } catch {
    return 1;
  }
}

/**
 * Apply plan discount to a credit amount (rounds to at most 2 decimal places).
 * Example: applyDiscount(1, 0.8) === 0.8.
 */
export function applyDiscount(amount: number, discountRate: number): number {
  if (amount <= 0) return 0;
  if (discountRate >= 1) return amount;
  return roundCredits(amount * discountRate);
}
