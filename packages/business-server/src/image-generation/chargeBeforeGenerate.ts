import type { NewGeneration, NewGenerationBatch } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';
import type { CreateImageServicePayload } from '@/server/routers/lambda/image';

import { computeImageCredits, hasAnyCreditPricing } from '../credits/computeCredits';
import { deductCredits, InsufficientCreditsError } from '../credits/deductCredits';
import { loadModelCreditPricing } from '../credits/loadModelPricing';
import { loadPlanDiscountRate } from '../credits/planDiscount';

interface ChargeParams {
  clientIp?: string | null;
  configForDatabase: CreateImageServicePayload['params'];
  generationParams: CreateImageServicePayload['params'];
  generationTopicId: string;
  imageNum: number;
  model: string;
  provider: string;
  serverDB?: LobeChatDatabase;
  userId: string;
  workspaceId?: string;
}

type ChargeResult =
  | undefined
  | {
      data: {
        batch: NewGenerationBatch;
        generations: NewGeneration[];
      };
      success: true;
    };

export type ImagePrechargeResult = {
  amount: number;
  discountRate?: number;
  kind: 'image';
  remaining: number;
};

export async function chargeBeforeGenerate(
  params: ChargeParams,
): Promise<(ChargeResult & { prechargeResult?: ImagePrechargeResult }) | undefined> {
  const { model, provider, userId, imageNum, serverDB } = params;
  if (!serverDB) return undefined;

  const pricing = await loadModelCreditPricing(serverDB, userId, provider, model);
  const discountRate = await loadPlanDiscountRate(serverDB, userId, provider, model);
  // 折扣在原始金额上生效后再取整，避免先取整导致小额折扣被吞
  const baseAmount = computeImageCredits(pricing, imageNum, { discountRate });
  if (!hasAnyCreditPricing(pricing) || baseAmount <= 0) return undefined;

  const amount = baseAmount;
  // 折前原价（用于用量页展示划线价）
  const originalAmount =
    discountRate > 0 && discountRate < 1
      ? computeImageCredits(pricing, imageNum)
      : amount;

  try {
    const result = await deductCredits(serverDB, userId, amount, {
      detail: { discountRate, imageNum, originalAmount },
      model,
      provider,
      reason: 'image_request',
    });
    return {
      prechargeResult: { amount: result.deducted, discountRate, kind: 'image', remaining: result.remaining },
    } as any;
  } catch (e) {
    if (e instanceof InsufficientCreditsError) throw e;
    throw e;
  }
}
