import type { LobeChatDatabase } from '@/database/type';

import { refundCredits } from '../credits/deductCredits';

interface ChargeParams {
  computePriceParams?: { generateAudio?: boolean; resolution?: string };
  isError?: boolean;
  latency?: number;
  metadata: {
    asyncTaskId: string;
    generationBatchId: string;
    modelId: string;
    topicId?: string;
  };
  model: string;
  prechargeResult?: Record<string, unknown>;
  provider: string;
  serverDB?: LobeChatDatabase;
  usage?: { completionTokens: number; totalTokens: number };
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
    console.error('[video] refundCredits failed:', e);
  }
}
