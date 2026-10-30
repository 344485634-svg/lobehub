/**
 * Closed-product credit pricing stored on ai_models.pricing JSON.
 * Units are product credits (套餐积分点), not USD.
 */
export type ModelCreditPricing = {
  /** Image / legacy flat per-call cost */
  creditsPerRequest?: number;
  /** Chat: credits charged per 1,000,000 input tokens */
  creditsPerMillionInputTokens?: number;
  /** Chat: credits charged per 1,000,000 output tokens */
  creditsPerMillionOutputTokens?: number;
  /**
   * Video: credits charged per second, keyed by resolution label.
   * Example: { "480p": 5, "720p": 10, "1080p": 20 }
   */
  videoCreditsPerSecondByResolution?: Record<string, number>;
  /** Video fallback when resolution key is missing */
  videoCreditsPerSecond?: number;
};

export type CreditChargeReason =
  | 'chat_tokens'
  | 'image_request'
  | 'video_generation'
  | 'manual'
  | 'refund';
