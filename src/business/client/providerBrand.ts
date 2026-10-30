/**
 * Closed-product brand display for provider ids.
 * Internal runtime id stays `newapi` so API/routing is unchanged.
 */
const PROVIDER_BRAND_NAME: Record<string, string> = {
  lobehub: 'ChatX',
  newapi: 'ChatX',
};

export function getProviderBrandName(providerId?: string | null): string {
  if (!providerId) return '';
  return PROVIDER_BRAND_NAME[providerId] || providerId;
}

/** e.g. newapi/glm-5.2 → ChatX/glm-5.2 */
export function formatProviderModelLabel(
  provider?: string | null,
  model?: string | null,
): string {
  const p = getProviderBrandName(provider);
  const m = model || '';
  if (p && m) return `${p}/${m}`;
  return p || m || '-';
}
