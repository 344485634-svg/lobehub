import type { NewGeneration, NewGenerationBatch } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';
import type { CreateVideoServicePayload } from '@/server/routers/lambda/video';

import { computeVideoCredits, hasAnyCreditPricing } from '../credits/computeCredits';
import { deductCredits, InsufficientCreditsError } from '../credits/deductCredits';
import { loadModelCreditPricing } from '../credits/loadModelPricing';
import { loadPlanDiscountRate } from '../credits/planDiscount';

interface ChargeParams {
  generationTopicId: string;
  model: string;
  params: CreateVideoServicePayload['params'];
  provider: string;
  serverDB?: LobeChatDatabase;
  userId: string;
  workspaceId?: string;
}

interface ErrorBatch {
  data: {
    batch: NewGenerationBatch;
    generations: NewGeneration[];
  };
  success: true;
}

export type VideoPrechargeResult = {
  amount: number;
  discountRate?: number;
  duration: number;
  kind: 'video';
  remaining: number;
  resolution?: string;
};

interface ChargeBeforeResult {
  errorBatch?: ErrorBatch;
  prechargeResult?: VideoPrechargeResult;
}

export async function chargeBeforeGenerate(params: ChargeParams): Promise<ChargeBeforeResult> {
  const { model, provider, userId, serverDB, params: genParams } = params;
  if (!serverDB) return {};

  const pricing = await loadModelCreditPricing(serverDB, userId, provider, model);
  const duration = Number((genParams as any)?.duration) || 0;
  const resolution = (genParams as any)?.resolution as string | undefined;
  const discountRate = await loadPlanDiscountRate(serverDB, userId, provider, model);
  // 折扣在原始金额上生效后再取整，避免先取整导致小额折扣被吞
  const baseAmount = computeVideoCredits(pricing, { duration, resolution }, { discountRate });

  if (!hasAnyCreditPricing(pricing) || baseAmount <= 0) return {};

  const amount = baseAmount;
  // 折前原价（用于用量页展示划线价）
  const originalAmount =
    discountRate > 0 && discountRate < 1
      ? computeVideoCredits(pricing, { duration, resolution })
      : amount;

  try {
    const result = await deductCredits(serverDB, userId, amount, {
      detail: { discountRate, duration, originalAmount, resolution },
      model,
      provider,
      reason: 'video_generation',
    });
    return {
      prechargeResult: {
        amount: result.deducted,
        discountRate,
        duration,
        kind: 'video',
        remaining: result.remaining,
        resolution,
      },
    };
  } catch (e) {
    if (e instanceof InsufficientCreditsError) throw e;
    throw e;
  }
}
