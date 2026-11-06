import createDebug from 'debug';

const log = createDebug('lobe-media:reference');

/** 是否为远程上游可直接拉取的 HTTP(S) URL */
export function isPublicHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    // 本地/内网地址远程上游拉不到
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    // 30s 超时:本地图(如 localhost S3)正常应在秒级返回,挂起会拖慢整个创建请求
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * 解析媒体素材最终 URL:
 * - 已是公网 HTTP(S) → 原样使用(远程上游可下载)
 * - 本地/内网/相对路径 → 尝试内联 base64(仅图片;万相等上游官方支持
 *   `data:{MIME};base64,{data}` 形式的 media url)
 * - 无法解析 → 返回 null(调用方跳过该项)
 */
export async function resolveMediaUrl(
  url: string,
  kind: 'audio' | 'image' | 'video',
): Promise<string | null> {
  if (!url) return null;
  if (isPublicHttpUrl(url)) return url;

  // 视频/音频参考:远程上游强制 HTTP(S) URL,本地地址无法内联
  if (kind === 'video' || kind === 'audio') {
    log(
      'Skip %s reference: media_url is not a public HTTP(S) URL (got %s). Upload to public storage or use a reachable URL.',
      kind,
      url.slice(0, 80),
    );
    return null;
  }

  // 图片:本地地址尝试 base64 兜底
  if (url.startsWith('data:')) return url;
  const dataUrl = await fetchImageAsDataUrl(url);
  if (dataUrl) return dataUrl;

  log('Failed to resolve image reference URL: %s', url.slice(0, 80));
  return null;
}
