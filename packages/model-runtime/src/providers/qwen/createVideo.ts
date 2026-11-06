import createDebug from 'debug';

import type { CreateVideoOptions } from '../../core/openaiCompatibleFactory';
import type { CreateVideoPayload, CreateVideoResponse } from '../../types/video';
import { resolveMediaUrl } from '../../utils/mediaReference';
import { AgentRuntimeError } from '../../utils/createError';

const log = createDebug('lobe-video:qwen');

interface QwenVideoTaskResponse {
  output: {
    code?: string;
    error_message?: string;
    message?: string;
    task_id: string;
    task_status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
    video_url?: string;
    cover_image_url?: string;
    // For keyframe models
    first_frame_url?: string;
    last_frame_url?: string;
  };
  request_id: string;
  usage?: {
    duration?: number;
    size?: string;
    video_count?: number;
  };
}

// Model patterns for different video generation types
const image2VideoModels = [
  /^wan2\.(2|5)-i2v-/,
  /^wanx2\.(0|1)-i2v-/,
  /img2video$/,
  /reference2video$/,
  /i2v$/,
  /it2v$/,
];
const keyframe2VideoModels = [/^wan2\.(2|5)-kf2v-/, /start-end2video$/, /kf2v$/];
const reference2VideoModels = [/r2v$/];

/**
 * Query the status of a video generation task
 */
export async function queryQwenVideoStatus(
  taskId: string,
  apiKey: string,
  baseUrl: string,
): Promise<QwenVideoTaskResponse> {
  const endpoint = `${baseUrl}/api/v1/tasks/${taskId}`;

  log('Querying task status for: %s', taskId);

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    method: 'GET',
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      // Failed to parse JSON error response
    }
    throw new Error(
      `Failed to query task status for ${taskId} (${response.status}): ${errorData?.message || response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Poll video status and return standardized result
 */
export async function pollQwenVideoStatus(
  taskId: string,
  apiKey: string,
  baseUrl: string,
): Promise<
  | { status: 'success'; videoUrl: string }
  | { status: 'failed'; error: string }
  | { status: 'pending' }
> {
  const response = await queryQwenVideoStatus(taskId, apiKey, baseUrl);

  if (response.output.task_status === 'SUCCEEDED') {
    const videoUrl = response.output.video_url;
    if (!videoUrl) {
      return { error: 'Task succeeded but no video URL found', status: 'failed' };
    }
    return { status: 'success', videoUrl };
  }

  if (response.output.task_status === 'FAILED') {
    // 百炼把失败原因放在 output.message 或 output.error_message(不同接口版本字段不一),
    // 缺失时兜底 output.code,避免用户只看到空泛文案
    return {
      error: response.output.error_message || response.output.message || response.output.code,
      status: 'failed',
    };
  }

  return { status: 'pending' };
}

// Helper function to check if model matches any pattern in the array
function matchesModelPattern(model: string, patterns: Array<RegExp>): boolean {
  return patterns.some((pattern) => pattern.test(model));
}

/**
 * Create a video generation task with Qwen DashScope API
 * Supports text-to-video, image-to-video, and keyframe-to-video
 */
async function createVideoTask(
  payload: CreateVideoPayload,
  apiKey: string,
  taskType: 'video-generation' | 'image2video',
  provider: string,
  baseUrl: string,
): Promise<string> {
  const { model, params } = payload;
  const { prompt, imageUrl, imageUrls, endImageUrl, mediaUrl } = params;

  // Determine the endpoint based on task type
  const url = `${baseUrl}/api/v1/services/aigc/${taskType}/video-synthesis`;

  log('Creating %s task with model: %s, endpoint: %s', taskType, model, url);

  const input: Record<string, any> = {};
  const parameters: Record<string, any> = {};

  // Validate required parameters based on model type
  if (
    matchesModelPattern(model, image2VideoModels) ||
    matchesModelPattern(model, reference2VideoModels)
  ) {
    if (!imageUrl) {
      throw AgentRuntimeError.createVideo({
        error: new Error('imageUrl is required for image-to-video models'),
        errorType: 'ProviderBizError',
        provider,
      });
    }
  } else if (matchesModelPattern(model, keyframe2VideoModels) && (!imageUrl || !endImageUrl)) {
    throw AgentRuntimeError.createVideo({
      error: new Error(
        'imageUrl (first frame) and endImageUrl (last frame) are required for keyframe-to-video models',
      ),
      errorType: 'ProviderBizError',
      provider,
    });
  }

  // Handle media input based on model type
  if (model.startsWith('vidu/')) {
    const media = [];
    if (imageUrl) {
      media.push({
        type: 'image',
        url: imageUrl,
      });
    }
    if (imageUrls && imageUrls.length > 0) {
      imageUrls.forEach((url) =>
        media.push({
          type: 'image',
          url,
        }),
      );
    }
    if (endImageUrl) {
      media.push({
        type: 'image',
        url: endImageUrl,
      });
    }
    if (media.length > 0) {
      input.media = media;
    }
  } else if (model.startsWith('kling/')) {
    const media = [];
    if (imageUrl) {
      media.push({
        type: 'first_frame',
        url: imageUrl,
      });
    }
    if (imageUrls && imageUrls.length > 0) {
      if (imageUrls.length === 1 && endImageUrl) {
        media.push({
          type: 'first_frame',
          url: imageUrls[0],
        });
      } else {
        imageUrls.forEach((url) =>
          media.push({
            type: 'refer',
            url,
          }),
        );
      }
    }
    if (endImageUrl) {
      media.push({
        type: 'last_frame',
        url: endImageUrl,
      });
    }
    if (media.length > 0) {
      input.media = media;
    }
  } else if (model.startsWith('pixverse/')) {
    const media = [];
    if (imageUrls && imageUrls.length > 0) {
      imageUrls.forEach((url) =>
        media.push({
          type: 'image_url',
          url,
        }),
      );
    }
    if (imageUrl && !endImageUrl) {
      media.push({
        type: 'image_url',
        url: imageUrl,
      });
    } else if (imageUrl && endImageUrl) {
      media.push(
        {
          type: 'first_frame',
          url: imageUrl,
        },
        {
          type: 'last_frame',
          url: endImageUrl,
        },
      );
    }
    if (media.length > 0) {
      input.media = media;
    }
  } else if (model.startsWith('wan2.7') || model.startsWith('wan3.0') || model.startsWith('happyhorse')) {
    // wan3.0 全能参考模式(官方文档):媒体走 input.media 数组,
    // type 用 first_frame / reference_image / last_frame / reference_video
    const media = [];
    if (imageUrl) {
      media.push({
        type: 'first_frame',
        url: imageUrl,
      });
    }
    if (imageUrls && imageUrls.length > 0) {
      imageUrls.forEach((url) =>
        media.push({
          type: 'reference_image',
          url,
        }),
      );
    }
    // 参考视频(动作模仿/视频生视频):与参考图并存 —— 模型将参考视频的
    // 动作迁移到参考图人物上,实现"换人不换动作"。wan3.0 官方支持 video 类型 media。
    if (mediaUrl) {
      media.push({
        type: 'reference_video',
        url: mediaUrl,
      });
    }
    if (endImageUrl) {
      media.push({
        type: 'last_frame',
        url: endImageUrl,
      });
    }
    if (media.length > 0) {
      input.media = media;
    }
  } else if (matchesModelPattern(model, reference2VideoModels)) {
    if (imageUrl) {
      input.reference_urls = [imageUrl];
    }
    if (imageUrls && imageUrls.length > 0) {
      input.reference_urls = imageUrls;
    }
  } else if (matchesModelPattern(model, keyframe2VideoModels)) {
    if (imageUrl) {
      input.first_frame_url = imageUrl;
    }
    if (endImageUrl) {
      input.last_frame_url = endImageUrl;
    }
  } else if (matchesModelPattern(model, image2VideoModels) && imageUrl) {
    input.img_url = imageUrl;
  }

  // Add prompt to input for all models
  input.prompt = prompt;

  // 本地/内网媒体(如 localhost S3 的 RustFS 链接)远程百炼拉不到——
  // 实测报 InvalidParameter: Failed to download http://localhost:9000/...。
  // 统一在发送前解析:公网 URL 原样保留,本地图转 base64 data URL 内联
  // (万相 3.0 官方文档明确支持 data:{MIME};base64 形式的 media url)。
  if (Array.isArray(input.media) && input.media.length > 0) {
    const resolved = await Promise.all(
      (input.media as Array<{ type: string; url: string }>).map(async (m) => {
        // reference_video 是视频,按 video 类型解析(不能强行内联成图)
        const kind = m.type === 'reference_video' ? 'video' : 'image';
        const url = await resolveMediaUrl(m.url, kind);
        return url ? { ...m, url } : null;
      }),
    );
    input.media = resolved.filter((m): m is { type: string; url: string } => m !== null);
  }
  for (const key of ['img_url', 'first_frame_url', 'last_frame_url'] as const) {
    const value = input[key];
    if (typeof value === 'string' && value) {
      input[key] = (await resolveMediaUrl(value, 'image')) ?? value;
    }
  }
  if (Array.isArray(input.reference_urls)) {
    const resolved = await Promise.all(
      (input.reference_urls as string[]).map((u) => resolveMediaUrl(u, 'image')),
    );
    input.reference_urls = resolved.filter((u): u is string => u !== null);
  }

  // Add optional parameters
  if (params.aspectRatio) {
    if (model.startsWith('wan2.7') || model.startsWith('wan3.0')) {
      // Wan2.7 / Wan3.0 models use "ratio" parameter instead of "aspectRatio"
      parameters.ratio = params.aspectRatio;
    } else {
      parameters.aspectRatio = params.aspectRatio;
    }
  }

  if (params.size) {
    // Convert size format from "widthxheight" to "width*height" if needed
    parameters.size = params.size.replace('x', '*');
  }

  if (params.duration) {
    parameters.duration = params.duration;
  }

  if (params.generateAudio) {
    parameters.audio = params.generateAudio;
  }

  if (params.resolution) {
    if (model.startsWith('kling/')) {
      // For Kling models, resolution is determined by mode parameter. Map 1080p to pro mode, others to std mode.
      parameters.mode = params.resolution === '1080p' ? 'pro' : 'std';
    } else {
      parameters.resolution = params.resolution;
    }
  }

  if (params.promptExtend) {
    parameters.prompt_extend = params.promptExtend;
  }

  if (params.watermark) {
    parameters.watermark = params.watermark;
  }

  const response = await fetch(url, {
    body: JSON.stringify({
      input,
      model,
      parameters,
    }),
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    method: 'POST',
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      // Failed to parse JSON error response
    }
    throw new Error(
      `Failed to create ${taskType} task for model ${model} (${response.status}): ${errorData?.message || response.statusText}`,
    );
  }

  const data: QwenVideoTaskResponse = await response.json();
  log('Video task created with ID: %s', data.output.task_id);

  return data.output.task_id;
}

/**
 * Create video using Qwen DashScope API
 * Supports three types:
 * - text-to-video (wan2.2-t2v-plus, wanx2.0-t2v-*)
 * - image-to-video (wan2.2-i2v-plus, wanx2.0-i2v-*)
 * - keyframe-to-video (wan2.2-kf2v-flash)
 *
 * Creates a video generation task and returns immediately with inferenceId.
 * The frontend polls the task status using async task polling mechanism.
 */
export async function createQwenVideo(
  payload: CreateVideoPayload,
  options: CreateVideoOptions,
): Promise<CreateVideoResponse> {
  const { apiKey, baseURL, provider } = options;
  const { model, params } = payload;

  // Check if URL has /compatible-mode/v1 suffix and remove it
  const suffixIndex = baseURL ? baseURL.indexOf('/compatible-mode/v1') : -1;
  const dashscopeURL: string =
    suffixIndex > -1 ? baseURL!.slice(0, suffixIndex) : baseURL || 'https://dashscope.aliyuncs.com';

  log('Using dashscopeURL: %s', dashscopeURL);
  log('Creating video with model: %s, params: %O', model, params);

  try {
    const isKeyframe2Video = matchesModelPattern(model, keyframe2VideoModels);

    // Determine task type based on model
    let taskType: 'video-generation' | 'image2video';

    if (isKeyframe2Video) {
      taskType = 'image2video';
      log('Using image2video API for model: %s', model);
    } else {
      taskType = 'video-generation';
      log('Using video-generation API for model: %s', model);
    }

    // Create the video task
    const taskId = await createVideoTask(payload, apiKey, taskType, provider, dashscopeURL);

    log('Video task created with id: %s, returning immediately for frontend polling', taskId);

    // Return immediately with inferenceId only
    // Frontend will poll the task status using the async task polling mechanism
    // This avoids blocking the API response for 30+ seconds during server-side polling
    return { inferenceId: taskId };
  } catch (error) {
    log('Error in createQwenVideo: %O', error);

    throw AgentRuntimeError.createVideo({
      error: error as any,
      errorType: 'ProviderBizError',
      provider,
    });
  }
}
