import type { Pricing } from 'model-bank';

export interface ImageSinglePriceResult {
  approximatePrice?: number;
  price?: number;
}

const DEFAULT_REFERENCE_MP = (1024 * 1024) / 1_000_000;

export const resolveImageSinglePrice = (pricing?: Pricing): ImageSinglePriceResult => {
  if (!pricing) return {};

  // Priority 1: Use approximate price if explicitly provided
  if (typeof pricing.approximatePricePerImage === 'number') {
    return { approximatePrice: pricing.approximatePricePerImage };
  }

  // Priority 2: Calculate exact price from pricing units
  // Guard against missing/invalid `units` (e.g. closed-product models priced
  // only via creditsPerRequest) — an absent array previously threw TypeError
  // and broke the whole model list build.
  const imageGenerationUnit = Array.isArray(pricing.units)
    ? pricing.units.find((unit) => unit.name === 'imageGeneration')
    : undefined;
  if (!imageGenerationUnit) return {};

  if (imageGenerationUnit.strategy === 'fixed') {
    if (imageGenerationUnit.unit === 'image') {
      return { price: imageGenerationUnit.rate };
    }

    if (imageGenerationUnit.unit === 'megapixel') {
      return { price: imageGenerationUnit.rate * DEFAULT_REFERENCE_MP };
    }
  }

  // Lookup/tiered pricing typically requires explicit configuration; treat as unavailable here.
  return {};
};
