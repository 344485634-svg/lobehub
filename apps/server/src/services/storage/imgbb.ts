import { type LobeChatDatabase } from '@lobechat/database';

import { SystemConfigModel } from '@/database/models/systemConfig';
import type { StorageImgbbConfig } from '@/database/schemas/systemConfig';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

const IMGBB_API_URL = 'https://api.imgbb.com/1/upload';
/** imgbb accepts base64 (stripped of the data: prefix) or multipart; base64 is simplest. */
const IMGBB_MAX_BYTES = 32 * 1024 * 1024;

/** Load and decrypt the imgbb config; undefined when unset/disabled. */
export async function loadImgbbPlainConfig(db: LobeChatDatabase) {
  const model = new SystemConfigModel(db);
  const cfg = await model.getImgbbConfig();
  if (!cfg?.enabled || !cfg.apiKey) return undefined;

  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  let apiKey = cfg.apiKey;
  try {
    const r = await gateKeeper.decrypt(apiKey);
    apiKey = r.wasAuthentic ? r.plaintext : apiKey;
  } catch {
    /* keep raw */
  }

  return { ...cfg, apiKey } as StorageImgbbConfig & { apiKey: string };
}

/**
 * Upload a buffer to imgbb and return its public display URL.
 * Throws with a Chinese, actionable message on failure so gateway-reference
 * errors stay understandable.
 */
export async function uploadImageToImgbb(
  db: LobeChatDatabase,
  image: { buffer: Buffer; mime?: string },
): Promise<string> {
  const cfg = await loadImgbbPlainConfig(db);
  if (!cfg) {
    throw new Error(
      '参考图上传失败：图床（imgbb）尚未配置。请管理员在「管理后台 → 存储配置」填写 imgbb API Key。',
    );
  }

  if (image.buffer.length > IMGBB_MAX_BYTES) {
    throw new Error(
      `参考图上传失败：图片超过 imgbb 大小限制（${Math.round(IMGBB_MAX_BYTES / 1024 / 1024)}MB）`,
    );
  }

  const params = new URLSearchParams({ key: cfg.apiKey });
  if (cfg.expiration && cfg.expiration > 0) {
    params.set('expiration', String(Math.min(cfg.expiration, 15_552_000)));
  }
  params.set('image', image.buffer.toString('base64'));

  const res = await fetch(IMGBB_API_URL, {
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`参考图上传失败：imgbb 返回 ${res.status} ${text.slice(0, 200)}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('参考图上传失败：imgbb 响应无法解析');
  }

  const url: string | undefined = json?.data?.display_url || json?.data?.url;
  if (!url) {
    throw new Error(`参考图上传失败：imgbb 未返回 URL（${text.slice(0, 200)}）`);
  }
  return url;
}
