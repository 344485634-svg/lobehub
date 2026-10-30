import type { LobeChatDatabase } from '@/database/type';

import { computeChatCredits } from './computeCredits';
import { deductCredits } from './deductCredits';
import { loadModelCreditPricing } from './loadModelPricing';
import { loadPlanDiscountRate } from './planDiscount';

/**
 * Settle chat credits after a successful LLM turn.
 * @param messageId optional — stored in ledger meta for idempotency
 */
export async function chargeChatUsage(params: {
  db: LobeChatDatabase;
  inputTokens?: number;
  messageId?: string;
  model: string;
  outputTokens?: number;
  provider: string;
  userId: string;
}): Promise<{ deducted: number } | null> {
  const { db, userId, provider, model, inputTokens, outputTokens, messageId } = params;
  if (!userId || !db) {
    console.warn('[credits] chargeChatUsage skipped: missing userId/db', { model, provider });
    return null;
  }

  try {
    if (messageId) {
      try {
        const { creditLedgers } = await import('@/database/schemas/creditReferral');
        const { and, eq, sql } = await import('drizzle-orm');
        const existing = await db
          .select({ id: creditLedgers.id })
          .from(creditLedgers)
          .where(
            and(
              eq(creditLedgers.userId, userId),
              sql`${creditLedgers.meta}->>'messageId' = ${messageId}`,
              eq(creditLedgers.reason, 'chat_tokens'),
            ),
          )
          .limit(1);
        if (existing.length > 0) {
          console.log('[credits] chargeChatUsage already charged', { messageId });
          return null;
        }
      } catch (e) {
        console.warn('[credits] idempotency check failed', e);
      }
    }

    const pricing = await loadModelCreditPricing(db, userId, provider, model);
    // Apply per-model plan discount (e.g. basic plan 8折) BEFORE rounding so
    // small credits are not eaten by Math.ceil (e.g. 1.6 after 8折 → must be 1, not 2).
    const discountRate = await loadPlanDiscountRate(db, userId, provider, model);
    const baseAmount = computeChatCredits(pricing, { inputTokens, outputTokens }, { discountRate });
    if (baseAmount <= 0) {
      console.log('[credits] chargeChatUsage amount=0', {
        hasPricing: !!pricing,
        inputTokens,
        model,
        outputTokens,
        pricing,
        provider,
      });
      return null;
    }

    const amount = baseAmount;
    // 折前原价（用于用量页展示划线价）
    const originalAmount =
      discountRate > 0 && discountRate < 1
        ? computeChatCredits(pricing, { inputTokens, outputTokens })
        : amount;

    const result = await deductCredits(db, userId, amount, {
      detail: { discountRate, inputTokens, messageId, originalAmount, outputTokens },
      model,
      provider,
      reason: 'chat_tokens',
    });
    console.log('[credits] chargeChatUsage ok', {
      amount: result.deducted,
      discountRate,
      messageId,
      model,
      provider,
      remaining: result.remaining,
      userId,
    });
    return { deducted: result.deducted };
  } catch (e) {
    console.error('[credits] chargeChatUsage failed:', e);
    return null;
  }
}
