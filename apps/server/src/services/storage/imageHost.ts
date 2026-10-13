import { type LobeChatDatabase } from '@lobechat/database';

import { SystemConfigModel } from '@/database/models/systemConfig';
import type { ImageHostProvider, StorageImageHostConfig } from '@/database/schemas/systemConfig';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

const IMGBB_API_URL = 'https://api.imgbb.com/1/upload';
/** imgbb accepts base64 (stripped of the data: prefix) or multipart; base64 is simplest. */
const IMGBB_MAX_BYTES = 32 * 1024 * 1024;

const SEE_UPLOAD_URL = 'https://s.ee/api/v1/file/upload';
/** s.ee (SM.MS 继任) 上限随套餐;免费档按 5MB 防御性限制 */
const SEE_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_HOST_LABELS: Record<ImageHostProvider, string> = {
  imgbb: 'imgbb',
  see: 'S.EE (原 SM.MS)',
};

/** Load and decrypt the image-host config; undefined when unset/disabled. */
export async function loadImageHostPlainConfig(db: LobeChatDatabase) {
  const model = new SystemConfigModel(db);
  const cfg = await model.getImageHostConfig();
  if (!cfg?.enabled || !cfg.apiKey) return undefined;

  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
  let apiKey = cfg.apiKey;
  try {
    const r = await gateKeeper.decrypt(apiKey);
    apiKey = r.wasAuthentic ? r.plaintext : apiKey;
  } catch {
    /* keep raw */
  }

  return { ...cfg, provider: (cfg.provider ?? 'imgbb') as ImageHostProvider, apiKey };
}

/**
 * Upload a buffer to the configured image host and return its public URL.
 * Throws with a Chinese, actionable message on failure so gateway-reference
 * errors stay understandable.
 */
export async function uploadImageToImageHost(
  db: LobeChatDatabase,
  image: { buffer: Buffer; mime?: string },
): Promise<string> {
  const cfg = await loadImageHostPlainConfig(db);
  if (!cfg) {
    throw new Error(
      '参考图上传失败：图床尚未配置。请管理员在「管理后台 → 存储配置」选择图床服务商并填写 API Key。',
    );
  }

  if (cfg.provider === 'see') {
    return uploadToSee(cfg, image);
  }
  return uploadToImgbb(cfg, image);
}

async function uploadToImgbb(
  cfg: StorageImageHostConfig & { apiKey: string },
  image: { buffer: Buffer; mime?: string },
): Promise<string> {
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

async function uploadToSee(
  cfg: StorageImageHostConfig & { apiKey: string },
  image: { buffer: Buffer; mime?: string },
): Promise<string> {
  if (image.buffer.length > SEE_MAX_BYTES) {
    throw new Error(
      `参考图上传失败：图片超过 S.EE 大小限制（${Math.round(SEE_MAX_BYTES / 1024 / 1024)}MB）。` +
        '可在管理后台切换为 imgbb（32MB）。',
    );
  }

  // SM.MS 兼容接口:multipart 字段 smfile,Authorization 头直接放 token(无 Bearer 前缀)
  const form = new FormData();
  form.append(
    'smfile',
    new Blob([new Uint8Array(image.buffer)], { type: image.mime || 'image/png' }),
    'reference.png',
  );

  const res = await fetch(SEE_UPLOAD_URL, {
    body: form,
    headers: { Authorization: cfg.apiKey },
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`参考图上传失败：S.EE 返回 ${res.status} ${text.slice(0, 200)}`);
  }

  // SM.MS 兼容响应:{success:true, code:'success', data:{url,...}};错误为 {code:-1, message}
  if (json?.success === false || json?.code === -1 || !res.ok) {
    throw new Error(
      `参考图上传失败：S.EE 返回 ${res.status} ${json?.message || text.slice(0, 200)}`,
    );
  }

  // 兼容两种直链字段:url(直链) / path(部分版本)
  const url: string | undefined = json?.data?.url || json?.data?.path;
  if (!url) {
    throw new Error(`参考图上传失败：S.EE 未返回 URL（${text.slice(0, 200)}）`);
  }
  return url;
}
