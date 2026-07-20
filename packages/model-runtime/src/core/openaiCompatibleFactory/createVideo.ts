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
 * 用于"本地数据 + 远程云 API"架构(如桌面端):参考图在本地(localhost S3),
 * 远程网关无法通过 http URL 下载本机图片,故内联 base64 发送,网关免下载。
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
  const { prompt, imageUrl, imageUrls, endImageUrl, mediaUrl, size, duration, aspectRatio } = params;

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
    // OpenAI-compatible 网关(如 newapi/api.liuma.ai 远程):
    // 参考图常在本地(localhost S3),远程网关无法下载 → 转 base64 data URL 内联发送。
    // 网关用 reference_contents 数组接收参考素材(每项含 type/media_url/name)。
    // type=image(图片参考), type=video(视频参考)。
    const referenceContents: Array<{
      media_url: string;
      name: string;
      type: string;
    }> = [];

    // 首帧图片 → reference_contents type=image name=人物
    if (imageUrl) {
      const dataUrl = await fetchImageAsDataUrl(imageUrl);
      if (dataUrl) referenceContents.push({ media_url: dataUrl, name: '人物', type: 'image' });
    }
    // 多参考图 → reference_contents type=image name=参考图N
    for (const url of imageUrls ?? []) {
      const dataUrl = await fetchImageAsDataUrl(url);
      if (dataUrl)
        referenceContents.push({ media_url: dataUrl, name: '参考图', type: 'image' });
    }
    // 尾帧图片 → reference_contents type=image name=尾帧
    if (endImageUrl) {
      const dataUrl = await fetchImageAsDataUrl(endImageUrl);
      if (dataUrl) referenceContents.push({ media_url: dataUrl, name: '尾帧', type: 'image' });
    }
    // 视频参考 → reference_contents type=video name=动作
    // 网关对 video 类型只接受 URL(不支持 base64 data URL),直接发原始 URL
    if (mediaUrl) {
      referenceContents.push({ media_url: mediaUrl, name: '动作', type: 'video' });
    }

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
