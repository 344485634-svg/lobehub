import { type LobeChatDatabase } from '@lobechat/database';

import { SystemConfigModel } from '@/database/models/systemConfig';
import type { ImageHostProvider, StorageImageHostConfig } from '@/database/schemas/systemConfig';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

const IMGBB_API_URL = 'https://api.imgbb.com/1/upload';
/** imgbb accepts base64 (stripped of the data: prefix) or multipart; base64 is simplest. */
const IMGBB_MAX_BYTES = 32 * 1024 * 1024;

const SCDN_UPLOAD_URL = 'https://img.scdn.io/api/v1.php';
/** scdn.io 免登录匿名上传;未公布明确上限,防御性限制 */
const SCDN_MAX_BYTES = 20 * 1024 * 1024;

/** Load and decrypt the image-host config; undefined when unset/disabled. */
export async function loadImageHostPlainConfig(db: LobeChatDatabase) {
  const model = new SystemConfigModel(db);
  const cfg = await model.getImageHostConfig();
  if (!cfg?.enabled) return undefined;

  // 旧数据/未知值回落 imgbb;scdn 无需 Key,imgbb 缺 Key 时由上传器给出明确报错
  const provider: ImageHostProvider = cfg.provider === 'scdn' ? 'scdn' : 'imgbb';

  let apiKey = cfg.apiKey;
  if (apiKey) {
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    try {
      const r = await gateKeeper.decrypt(apiKey);
      apiKey = r.wasAuthentic ? r.plaintext : apiKey;
    } catch {
      /* keep raw */
    }
  }

  return { ...cfg, provider, apiKey } as StorageImageHostConfig & {
    provider: ImageHostProvider;
    apiKey?: string;
  };
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
      '参考图上传失败：图床尚未配置。请管理员在「管理后台 → 存储配置」选择图床服务商并保存。',
    );
  }

  if (cfg.provider === 'scdn') {
    return uploadToScdn(image);
  }
  return uploadToImgbb(cfg, image);
}

async function uploadToImgbb(
  cfg: StorageImageHostConfig & { provider: ImageHostProvider; apiKey?: string },
  image: { buffer: Buffer; mime?: string },
): Promise<string> {
  if (!cfg.apiKey) {
    throw new Error(
      '参考图上传失败：imgbb 未填写 API Key。请管理员在「管理后台 → 存储配置」填写后保存。',
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

async function uploadToScdn(image: { buffer: Buffer; mime?: string }): Promise<string> {
  if (image.buffer.length > SCDN_MAX_BYTES) {
    throw new Error(
      `参考图上传失败：图片超过图床大小限制（${Math.round(SCDN_MAX_BYTES / 1024 / 1024)}MB）`,
    );
  }

  // img.scdn.io 免登录匿名上传:multipart 字段 image,无需鉴权
  const form = new FormData();
  form.append(
    'image',
    new Blob([new Uint8Array(image.buffer)], { type: image.mime || 'image/png' }),
    'reference.png',
  );

  const res = await fetch(SCDN_UPLOAD_URL, {
    body: form,
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`参考图上传失败：图床返回 ${res.status} ${text.slice(0, 200)}`);
  }

  // 响应:{success:true, url, data:{url,...}};失败含 error/message 字段
  if (!json?.success || !res.ok) {
    throw new Error(
      `参考图上传失败：图床返回 ${res.status} ${json?.error || json?.message || text.slice(0, 200)}`,
    );
  }

  const url: string | undefined = json?.url || json?.data?.url;
  if (!url) {
    throw new Error(`参考图上传失败：图床未返回 URL（${text.slice(0, 200)}）`);
  }
  return await canonicalizeScdnUrl(url);
}

/**
 * scdn 的上传响应可能返回 CDN 后端直链（esaimg.cdn1.vip / edgeoneimg.cdn1.vip 等）。
 * 有模型网关的下载器拉取这类后端域名失败（远程图片下载或CDN缓存失败），而主域名
 * img.scdn.io 以相同路径提供同一文件、全球可达性最好——校验主域名能取到后再替换。
 */
async function canonicalizeScdnUrl(url: string): Promise<string> {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname !== 'img.scdn.io' && u.pathname.startsWith('/i/')) {
      const canonical = `https://img.scdn.io${u.pathname}`;
      const head = await fetch(canonical, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10_000),
      });
      if (head.ok) return canonical;
    }
  } catch {
    /* keep the original URL on any verification failure */
  }
  return url;
}
