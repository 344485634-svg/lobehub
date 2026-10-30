import type { ModelPricingContext } from '@lobechat/model-runtime';

import type { LobeChatDatabase } from '@/database/type';
import type { ModelPerformance, ModelUsage } from '@/types/index';

import { refundCredits } from '../credits/deductCredits';

interface ChargeParams {
  isError?: boolean;
  metadata: {
    asyncTaskId: string;
    generationBatchId: string;
    modelId: string;
    topicId?: string;
  };
  metrics?: ModelPerformance;
  modelUsage?: ModelUsage;
  prechargeResult?: { amount?: number };
  pricingContext?: ModelPricingContext;
  provider: string;
  serverDB?: LobeChatDatabase;
  userId: string;
  workspaceId?: string;
}

export async function chargeAfterGenerate(params: ChargeParams): Promise<void> {
  if (!params.isError) return;
  const amount = Number(params.prechargeResult?.amount) || 0;
  if (amount <= 0 || !params.serverDB) return;
  try {
    await refundCredits(params.serverDB, params.userId, amount);
  } catch (e) {
    console.error('[image] refundCredits failed:', e);
  }
}
