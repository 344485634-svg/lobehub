import createDebug from 'debug';

import type {
  CreateVideoPayload,
  CreateVideoResponse,
  PollVideoStatusResult,
} from '../../types/video';
import { resolveMediaUrl } from '../../utils/mediaReference';
import { resolveMappedModelId } from '../../utils/modelIdMapping';
import type { CreateVideoOptions } from '../openaiCompatibleFactory';

const log = createDebug('lobe-video:openai-compatible');

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
    // 状态查询挂起最危险:轮询循环会永久卡住,任务僵在 processing。
    // 60s 足够慢网关,超时后由轮询层重试。
    signal: AbortSignal.timeout(60_000),
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
 * Compatible with OpenAI Sora API and Aliyun-style task payloads.
 */
export async function pollOpenAICompatibleVideoStatus(
  inferenceId: string,
  options: { apiKey: string; baseURL: string },
): Promise<PollVideoStatusResult> {
  const response = await queryOpenAICompatibleVideoStatus(inferenceId, options);

  // 网关可能透传不同上游的响应形态:
  // - OpenAI Sora 风格:顶层 { status: 'completed'|'failed'|..., url }
  // - 阿里云万相风格(output.task_status):{ output: { task_status: 'SUCCEEDED'|'FAILED'|..., video_url } }
  // 统一做大小写不敏感归一,否则上游早已完成,轮询仍按 pending 空转到超时。
  const asRecord = response as unknown as Record<string, any>;
  const output = asRecord.output ?? {};
  const rawStatus = String(
    asRecord.status ?? output.task_status ?? output.status ?? '',
  ).toLowerCase();
  const errorMessage = asRecord.error?.message ?? output.message ?? output.code;
  // URL 候选覆盖各网关形态;实测网关(如 newapi 系 api.xinguhub.com)把链接放 metadata.url,
  // 且进行中时是空串——用 || 链跳过空值,避免把 '' 误当有效链接。
  const videoUrl: string | undefined =
    asRecord.url ||
    asRecord.video_url ||
    output.video_url ||
    asRecord.metadata?.url ||
    asRecord.metadata?.video_url ||
    asRecord.data?.[0]?.url ||
    undefined;

  if (['completed', 'succeeded', 'success'].includes(rawStatus)) {
    // Some providers return the download URL directly in the url field
    // Others require calling /videos/{id}/content endpoint
    let finalVideoUrl = videoUrl;

    if (!finalVideoUrl) {
      // If no URL returned, construct the content endpoint URL
      finalVideoUrl = `${options.baseURL}/videos/${inferenceId}/content`;
    }

    // Return headers for authenticated download
    // OpenAI-compatible providers use Bearer token
    return {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      status: 'success',
      videoUrl: finalVideoUrl,
    };
  }

  if (['failed', 'canceled', 'cancelled', 'error'].includes(rawStatus)) {
    return {
      error: errorMessage || 'Video generation failed',
      status: 'failed',
    };
  }

  // queued, in_progress, PENDING, RUNNING, UNKNOWN 等其余状态视为仍在进行
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
  const {
    prompt,
    imageUrl,
    imageUrls,
    endImageUrl,
    mediaUrl,
    size,
    duration,
    aspectRatio,
    resolution,
  } = params;

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
    // OpenAI-compatible 网关(如 newapi / api.chatx.ai):
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
      // liuma 等网关的 reference_contents[].media_url 只接受公网 HTTP(S) URL
      // (已实测拒绝 base64 data:)。本地/内网存储的图片无法被网关拉取,曾经
      // 被静默跳过(参考图无声消失)或发出去被网关 400(晦涩难懂)。这里改为
      // 快速失败并给出可操作的原因。
      if (media.startsWith('data:')) {
        throw new Error(
          '参考图无法被视频网关获取：图片存储在非公开的本地/内网地址。' +
            '请联系管理员在「管理后台 → 存储配置」启用图床转存（国内网络建议选择 S.EE），' +
            '或将 S3_PUBLIC_DOMAIN 配置为公网可达的地址（参考图会以公网 URL 提交给网关），' +
            '或先使用公网图片 URL 进行测试。',
        );
      }
      referenceContents.push({ media_url: media, name, type });
    };

    await pushRef(imageUrl, '人物', 'image');
    for (const [idx, url] of (imageUrls ?? []).entries()) {
      await pushRef(url, `参考图${idx + 1}`, 'image');
    }
    await pushRef(endImageUrl, '尾帧', 'image');
    await pushRef(mediaUrl, '动作', 'video');

    if (referenceContents.length > 0) {
      body['reference_contents'] = referenceContents;
      // liuma 网关的 minimax-h3 等参考生视频模型要求显式声明参考模式,
      // 否则网关会忽略 reference_contents(文档:mode=reference2video)。
      body['mode'] = 'reference2video';
    }

    // 网关(实测 api.xinguhub.com 等阿里系通道)的图生视频要求 input.media,
    // 其 OpenAI 风格入口实际认的传图字段是 input_reference(字符串:公网 URL 或
    // data URL 均已实测可用)。reference_contents 里的图它不会转发,
    // 缺图时会报 "Field required: input.media"。
    // 这里以字符串形态补发首图,reference_contents 仍保留给支持多参考的网关。
    const firstImageRef = referenceContents.find((r) => r.type === 'image');
    if (firstImageRef) body['input_reference'] = firstImageRef.media_url;

    // 网关用 aspect_ratio(非 size)、duration(数字,非 seconds 字符串)、resolution
    if (aspectRatio) body['aspect_ratio'] = aspectRatio;
    if (duration !== undefined && duration !== null) body['duration'] = duration;
    if (resolution) body['resolution'] = resolution;
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
