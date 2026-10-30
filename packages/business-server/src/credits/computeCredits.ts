import type { ModelCreditPricing } from './types';

const MILLION = 1_000_000;

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/** Round a credit amount to at most 2 decimal places. */
export const roundCredits = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100) / 100;

export function hasAnyCreditPricing(pricing?: ModelCreditPricing | null): boolean {
  if (!pricing) return false;
  if (n(pricing.creditsPerRequest) > 0) return true;
  if (n(pricing.creditsPerMillionInputTokens) > 0) return true;
  if (n(pricing.creditsPerMillionOutputTokens) > 0) return true;
  if (n(pricing.videoCreditsPerSecond) > 0) return true;
  const byRes = pricing.videoCreditsPerSecondByResolution;
  if (byRes && Object.values(byRes).some((v) => n(v) > 0)) return true;
  return false;
}

/** Chat / text models: input + output tokens billed per million. */
export function computeChatCredits(
  pricing: ModelCreditPricing | null | undefined,
  usage: { inputTokens?: number; outputTokens?: number },
  options?: { discountRate?: number },
): number {
  const inRate = n(pricing?.creditsPerMillionInputTokens);
  const outRate = n(pricing?.creditsPerMillionOutputTokens);
  const inputTokens = Math.max(0, Math.floor(Number(usage.inputTokens) || 0));
  const outputTokens = Math.max(0, Math.floor(Number(usage.outputTokens) || 0));

  if (inRate <= 0 && outRate <= 0) {
    // legacy fallback: flat per request once tokens exist
    const flat = n(pricing?.creditsPerRequest);
    return flat > 0 && inputTokens + outputTokens > 0 ? roundCredits(flat) : 0;
  }

  const raw = (inputTokens / MILLION) * inRate + (outputTokens / MILLION) * outRate;
  if (raw <= 0) return 0;

  const rate = options?.discountRate && options.discountRate > 0 && options.discountRate < 1
    ? options.discountRate
    : 1;
  // 积分支持最多 2 位小数：先在原始金额上应用折扣，再四舍五入到 2 位。
  // 例如 8 折：原价 1 → 0.8；原价 1.6 → 1.28。
  return roundCredits(raw * rate);
}

/** Image models: flat credits per request × image count. */
export function computeImageCredits(
  pricing: ModelCreditPricing | null | undefined,
  imageNum = 1,
  options?: { discountRate?: number },
): number {
  const per = n(pricing?.creditsPerRequest);
  const count = Math.max(1, Math.floor(Number(imageNum) || 1));
  if (per <= 0) return 0;
  const rate = options?.discountRate && options.discountRate > 0 && options.discountRate < 1
    ? options.discountRate
    : 1;
  return roundCredits(per * count * rate);
}

/** Normalize resolution labels: "720P" / "720" / "1280x720" → "720p" when possible. */
export function normalizeVideoResolution(raw?: string | null): string {
  if (!raw) return 'default';
  const s = String(raw).trim().toLowerCase();
  if (!s) return 'default';
  const pMatch = s.match(/(\d{3,4})\s*p/);
  if (pMatch) return `${pMatch[1]}p`;
  if (/^\d{3,4}$/.test(s)) return `${s}p`;
  // e.g. 1280x720
  const dim = s.match(/\d+\s*[x×]\s*(\d{3,4})/);
  if (dim) {
    const h = Number(dim[1]);
    if (h >= 1000) return '1080p';
    if (h >= 700) return '720p';
    if (h >= 400) return '480p';
  }
  return s;
}

/** Video models: duration(seconds) × credits/sec for resolution. */
export function computeVideoCredits(
  pricing: ModelCreditPricing | null | undefined,
  params: { duration?: number; resolution?: string },
  options?: { discountRate?: number },
): number {
  const duration = Math.max(0, Number(params.duration) || 0);
  if (duration <= 0) return 0;

  const resKey = normalizeVideoResolution(params.resolution);
  const table = pricing?.videoCreditsPerSecondByResolution || {};
  let rate = n(table[resKey]);
  if (rate <= 0) {
    // try bare number key without p
    const bare = resKey.replace(/p$/, '');
    rate = n(table[bare]) || n(table[`${bare}p`]);
  }
  if (rate <= 0) rate = n(pricing?.videoCreditsPerSecond);
  // last resort: legacy flat per request treated as whole-video cost (not per second)
  if (rate <= 0) {
    const flat = n(pricing?.creditsPerRequest);
    return flat > 0 ? roundCredits(flat) : 0;
  }

  const discount = options?.discountRate && options.discountRate > 0 && options.discountRate < 1
    ? options.discountRate
    : 1;
  return roundCredits(duration * rate * discount);
}
