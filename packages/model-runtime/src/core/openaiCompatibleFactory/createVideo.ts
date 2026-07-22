import createDebug from 'debug';

import type {
  CreateVideoPayload,
  CreateVideoResponse,
  PollVideoStatusResult,
} from '../../types/video';
import { resolveMappedModelId } from '../../utils/modelIdMapping';
import type { CreateVideoOptions } from '../openaiCompatibleFactory';

const log = createDebug('lobe-video:openai-compatible');

/**
 * 将图片 URL 取回并转为 base64 data URL。
 * 仅作兜底:部分本地网关仍接受 data URL;远程网关(api.liuma.ai)要求 media_url 必须是 HTTP(S)。
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** 是否为远程网关可直接拉取的 HTTP(S) URL */
function isPublicHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    // 本地/内网地址远程网关拉不到
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

/**
 * 解析参考素材最终 media_url:
 * - 已是公网 HTTP(S) → 原样使用(远程网关可下载)
 * - 本地/内网/相对路径 → 尝试内联 base64(仅图片类型部分网关接受)
 * - 无法解析 → 跳过该项
 */
async function resolveMediaUrl(url: string, kind: 'image' | 'video'): Promise<string | null> {
  if (!url) return null;
  if (isPublicHttpUrl(url)) return url;

  // 视频参考:网关强制 HTTP(S) URL,本地地址无法内联
  if (kind === 'video') {
    log(
      'Skip video reference: media_url is not a public HTTP(S) URL (got %s). Upload to public storage or use a reachable URL.',
      url.slice(0, 80),
    );
    return null;
  }

  // 图片:本地地址尝试 base64 兜底(部分兼容网关仍接受)
  if (url.startsWith('data:')) return url;
  const dataUrl = await fetchImageAsDataUrl(url);
  if (dataUrl) return dataUrl;

  log('Failed to resolve image reference URL: %s', url.slice(0, 80));
  return null;
}

interface OpenAIVideoStatusResponse {
  completed_at?: number;
  created?: number;
  created_at?: number;
  duration?: number;
  error?: {
    code?: string;
    message?: string;
  };
  expires_at?: number;
  height?: number;
  id?: string;
  model?: string;
  object?: string;
  progress?: number;
  prompt?: string;
  seconds?: string;
  size?: string;
  status?: string;
  url?: string;
  width?: number;
}

/**
 * Query the status of a video generation task
 * Compatible with OpenAI Sora API
 */
export async function queryOpenAICompatibleVideoStatus(
  inferenceId: string,
  options: { apiKey: string; baseURL: string },
): Promise<OpenAIVideoStatusResponse> {
  const statusUrl = `${options.baseURL}/videos/${inferenceId}`;

  log('Querying video status for: %s', inferenceId);

  const response = await fetch(statusUrl, {
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI-compatible video status API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OpenAIVideoStatusResponse;
  log('Video status response: %O', data);

  return data;
}

/**
 * Poll video status and return standardized result
 * Compatible with OpenAI Sora API
 */
export async function pollOpenAICompatibleVideoStatus(
  inferenceId: string,
  options: { apiKey: string; baseURL: string },
): Promise<PollVideoStatusResult> {
  const response = await queryOpenAICompatibleVideoStatus(inferenceId, options);

  if (response.status === 'completed') {
    // Some providers return the download URL directly in the url field
    // Others require calling /videos/{id}/content endpoint
    let videoUrl = response.url;

    if (!videoUrl) {
      // If no URL returned, construct the content endpoint URL
      videoUrl = `${options.baseURL}/videos/${inferenceId}/content`;
    }

    // Return headers for authenticated download
    // OpenAI-compatible providers use Bearer token
    return {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      status: 'success',
      videoUrl,
    };
  }

  if (response.status === 'failed') {
    return {
      error: response.error?.message || 'Video generation failed',
      status: 'failed',
    };
  }

  // queued, in_progress, or any other status means still pending
  return { status: 'pending' };
}

/**
 * OpenAI-compatible video generation implementation
 * Works with OpenAI Sora, and other OpenAI-compatible providers
 *
 * API Format:
 * POST /v1/videos
 * {
 *   model: string,
 *   prompt: string,
 *   seconds?: string,      // OpenAI Sora format (string type)
 *   input_reference?: string | { image_url: string } | { file_id: string },  // For image-to-video
 * }
 *
 * Creates a video generation task and returns immediately with inferenceId.
 * The frontend polls the task status using async task polling mechanism.
 */
export async function createOpenAICompatibleVideo(
  payload: CreateVideoPayload,
  options: CreateVideoOptions,
): Promise<CreateVideoResponse> {
  const { model, params } = payload;
  const requestModel = resolveMappedModelId(model, options);
  const { prompt, imageUrl, imageUrls, endImageUrl, mediaUrl, size, duration, aspectRatio } =
    params;

  log('Creating video with OpenAI-compatible API - model: %s, params: %O', requestModel, params);

  const baseURL = options.baseURL || 'https://api.openai.com/v1';

  // Build request body compatible with OpenAI Sora
  const body: Record<string, unknown> = {
    model: requestModel,
    prompt,
  };

  // Duration: prefer 'seconds' (string) for OpenAI Sora compatibility
  if (duration !== undefined && duration !== null) {
    body['seconds'] = duration.toString();
  }

  // Size/resolution
  if (size) {
    body['size'] = size;
  }

  // Image-to-video support: 全能参考模式
  // imageUrl → first_frame(首帧), imageUrls → images(多参考图), endImageUrl → last_frame(尾帧)
  const referenceImage = imageUrl || imageUrls?.[0];
  const isRealOpenAIVideoAPI = options.baseURL?.includes('api.openai.com');

  if (isRealOpenAIVideoAPI) {
    // 真·OpenAI Sora API:input_reference 对象
    if (referenceImage) {
      body['input_reference'] = { image_url: referenceImage };
    }
    if (endImageUrl) {
      body['last_frame'] = { image_url: endImageUrl };
    }
  } else {
    // OpenAI-compatible 网关(如 newapi / api.liuma.ai):
    // 官方要求 reference_contents[].media_url 必须是有效 HTTP(S) URL。
    // - 公网 URL:直接传
    // - 本地/内网图片:尽量转 data URL 兜底(部分网关不接受时会由上游再报错)
    // - 本地视频:无法内联,跳过并记录日志
    const referenceContents: Array<{
      media_url: string;
      name: string;
      type: string;
    }> = [];

    const seen = new Set<string>();
    const pushRef = async (
      url: string | null | undefined,
      name: string,
      type: 'image' | 'video',
    ) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      const media = await resolveMediaUrl(url, type);
      if (!media) return;
      // 远程网关不接受 data: 时,仅在图片且为 data 时仍发送(兼容旧网关);
      // 若是 video 且非 http, resolveMediaUrl 已返回 null。
      if (type === 'image' && media.startsWith('data:') && !isPublicHttpUrl(url)) {
        // api.liuma.ai 明确要求 HTTP(S),data URL 会被拒。本地图无法被远程拉时跳过并提示。
        log(
          'Skip local image reference for remote gateway (media_url must be HTTP(S)): %s',
          url.slice(0, 80),
        );
        return;
      }
      referenceContents.push({ media_url: media, name, type });
    };

    await pushRef(imageUrl, '人物', 'image');
    for (const [idx, url] of (imageUrls ?? []).entries()) {
      await pushRef(url, `参考图${idx + 1}`, 'image');
    }
    await pushRef(endImageUrl, '尾帧', 'image');
    await pushRef(mediaUrl, '动作', 'video');

    if (referenceContents.length > 0) body['reference_contents'] = referenceContents;

    // 网关用 aspect_ratio(非 size)和 duration(数字,非 seconds 字符串)
    if (aspectRatio) body['aspect_ratio'] = aspectRatio;
    if (duration !== undefined && duration !== null) body['duration'] = duration;
  }

  log('OpenAI-compatible video API request body: %O', body);

  const response = await fetch(`${baseURL}/videos`, {
    body: JSON.stringify(body),
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(300000), // 5 分钟超时(视频生成提交可能较慢)
  });

  if (!response.ok) {
    const errorText = await response.text();
    log('OpenAI-compatible video API error: %s %s', response.status, errorText);
    throw new Error(`OpenAI-compatible video API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  log('OpenAI-compatible video API response: %O', data);

  if (!data?.id) {
    throw new Error('Invalid response: missing id');
  }

  const inferenceId = data.id;
  log('Video task created with id: %s, returning immediately for frontend polling', inferenceId);

  // Return immediately with inferenceId only
  // Frontend will poll the task status using the async task polling mechanism
  // This avoids blocking the API response for 30 seconds during server-side polling
  return { inferenceId };
}
