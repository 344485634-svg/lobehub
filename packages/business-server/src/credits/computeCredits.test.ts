import { describe, expect, it } from 'vitest';

import {
  computeChatCredits,
  computeImageCredits,
  computeVideoCredits,
  hasAnyCreditPricing,
  normalizeVideoResolution,
} from './computeCredits';

describe('computeCredits', () => {
  it('computes chat credits per million tokens', () => {
    // 1M in + 0.5M out with rates 5 / 10 => 5 + 5 = 10
    expect(
      computeChatCredits(
        { creditsPerMillionInputTokens: 5, creditsPerMillionOutputTokens: 10 },
        { inputTokens: 1_000_000, outputTokens: 500_000 },
      ),
    ).toBe(10);
  });

  it('ceils fractional chat credits to at least 1', () => {
    expect(
      computeChatCredits(
        { creditsPerMillionInputTokens: 5, creditsPerMillionOutputTokens: 0 },
        { inputTokens: 1000, outputTokens: 0 },
      ),
    ).toBe(1);
  });

  it('falls back to flat per-request for chat when token rates are 0', () => {
    expect(
      computeChatCredits({ creditsPerRequest: 3 }, { inputTokens: 10, outputTokens: 10 }),
    ).toBe(3);
  });

  it('computes image credits per request × count', () => {
    expect(computeImageCredits({ creditsPerRequest: 2 }, 3)).toBe(6);
  });

  it('computes video credits by resolution × seconds', () => {
    expect(
      computeVideoCredits(
        { videoCreditsPerSecondByResolution: { '720p': 10, '1080p': 20 } },
        { duration: 5, resolution: '720p' },
      ),
    ).toBe(50);
  });

  it('normalizes resolution labels', () => {
    expect(normalizeVideoResolution('720P')).toBe('720p');
    expect(normalizeVideoResolution('1280x720')).toBe('720p');
  });

  it('detects any credit pricing', () => {
    expect(hasAnyCreditPricing({ creditsPerMillionInputTokens: 1 })).toBe(true);
    expect(hasAnyCreditPricing({ videoCreditsPerSecondByResolution: { '720p': 1 } })).toBe(true);
    expect(hasAnyCreditPricing({})).toBe(false);
  });
});
