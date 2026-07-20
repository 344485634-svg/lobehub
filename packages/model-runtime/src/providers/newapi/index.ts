import { LOBE_DEFAULT_MODEL_LIST, ModelProvider, gptImage2AspectRatioSchema } from 'model-bank';
import urlJoin from 'url-join';

import { createRouterRuntime } from '../../core/RouterRuntime';
import type { CreateRouterRuntimeOptions } from '../../core/RouterRuntime/createRuntime';
import { detectModelProvider, processMultiProviderModelList } from '../../utils/modelParse';
import { responsesAPIModels } from '../openai/openaiModelId';
import { resolveProviderRouteModels } from '../utils/resolveProviderRouteModels';

export interface NewAPIModelCard {
  created: number;
  id: string;
  object: string;
  owned_by: string;
  supported_endpoint_types?: string[];
}

export interface NewAPIPricing {
  completion_ratio?: number;
  description?: string;
  enable_groups: string[];
  model_name: string;
  model_price?: number;
  model_ratio?: number;
  /** 0: Pay-per-token, 1: Pay-per-call */
  quota_type: number;
  supported_endpoint_types?: string[];
  /** 网关模型标签:视频生成/图片生成/文本生成/文本生成/文本向量 */
  tags?: string | null;
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

// newapi is an OpenAI-compatible gateway whose gpt-image-2 takes an aspect-ratio
// string (e.g. "16:9") rather than the pixel resolutions the native OpenAI API
// expects. Without this, model-list sync would detect "gpt-image-2" as an OpenAI
// model and silently overwrite this schema with the pixel-resolution one.
const MODEL_PARAMETERS_OVERRIDES: Record<string, object> = {
  'gpt-image-2': gptImage2AspectRatioSchema,
};

// 网关拉取的模型若 ID 含这些关键词,自动识别为视频模型(type='video')。
// 避免 enrichment 未匹配 model-bank 卡片时默认设为 chat,导致视频模型不出现在选择器。
const VIDEO_MODEL_KEYWORDS = [
  'seedance',
  'sora',
  'veo',
  'grok-imagine',
  'kling',
  'hailuo',
  'cogvideo',
  'vidu',
  'wan2',
  'minimax-video',
  'duckscreen',
  'ltx-video',
  'pyramid',
];

const fetchPricing = async (
  pricingUrl: string,
  apiKey: string,
  providerId = ModelProvider.NewAPI,
): Promise<NewAPIPricing[] | null> => {
  try {
    let res: Response;
    if (isBrowser()) {
      res = await fetch(`/webapi/models/${encodeURIComponent(providerId)}/pricing`);
    } else {
      const fetchWithAuth = async (useAuth: boolean) => {
        const headers: Record<string, string> = {
          Accept: 'application/json; charset=utf-8',
        };
        if (useAuth && apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }
        return fetch(pricingUrl, { headers });
      };

      let usedAuth = true;
      try {
        res = await fetchWithAuth(true);
      } catch {
        usedAuth = false;
        res = await fetchWithAuth(false);
      }

      if (!res.ok && usedAuth) {
        res = await fetchWithAuth(false);
      }
    }

    if (!res.ok) return null;

    const body = await res.json();
    return body?.success && body?.data ? (body.data as NewAPIPricing[]) : null;
  } catch {
    return null;
  }
};

export const params = {
  debug: {
    chatCompletion: () => process.env.DEBUG_NEWAPI_CHAT_COMPLETION === '1',
  },
  defaultHeaders: {
    'X-Client': 'LobeHub',
  },
  id: ModelProvider.NewAPI,
  models: async ({ client: openAIClient, options }) => {
    const providerId =
      typeof options?.providerId === 'string' ? options.providerId : ModelProvider.NewAPI;

    // Get base URL (remove trailing API version paths like /v1, /v1beta, etc.)
    const baseURL = openAIClient.baseURL.replace(/\/v\d+[a-z]*\/?$/, '');

    const modelsPage = (await openAIClient.models.list()) as any;
    const modelList: NewAPIModelCard[] = modelsPage.data || [];

    // Create a set of existing model IDs for quick lookup
    const existingModelIds = new Set(modelList.map((m) => m.id));

    // Try to get pricing information to enrich model details
    const pricingMap: Map<string, NewAPIPricing> = new Map();

    const pricingList = await fetchPricing(
      `${baseURL}/api/pricing`,
      openAIClient.apiKey || '',
      providerId,
    );
    if (Array.isArray(pricingList)) {
      pricingList.forEach((pricing) => {
        pricingMap.set(pricing.model_name, pricing);
      });
    }

    const calculatePricing = (pricing: NewAPIPricing) => {
      let inputPrice: number | undefined;
      let outputPrice: number | undefined;

      if (pricing.quota_type === 0) {
        // Pay-per-token
        if (pricing.model_price && pricing.model_price > 0) {
          // model_price is a direct price value; need to confirm its unit.
          // Assumption: model_price is the price per 1,000 tokens (i.e., $/1K tokens).
          // To convert to price per 1,000,000 tokens ($/1M tokens), multiply by 1,000,000 / 1,000 = 1,000.
          // Since the base price is $0.002/1K tokens, multiplying by 2 gives $2/1M tokens.
          // Therefore, inputPrice = model_price * 2 converts the price to $/1M tokens for LobeChat.
          inputPrice = pricing.model_price * 2;
        } else if (pricing.model_ratio) {
          // model_ratio × $0.002/1K = model_ratio × $2/1M
          inputPrice = pricing.model_ratio * 2; // Convert to $/1M tokens
        }

        if (inputPrice !== undefined) {
          // Calculate output price
          outputPrice = inputPrice * (pricing.completion_ratio || 1);

          return {
            units: [
              {
                name: 'textInput',
                rate: inputPrice,
                strategy: 'fixed',
                unit: 'millionTokens',
              },
              {
                name: 'textOutput',
                rate: outputPrice,
                strategy: 'fixed',
                unit: 'millionTokens',
              },
            ],
          };
        }
      }
      // quota_type === 1 pay-per-call is not currently supported
      return undefined;
    };

    // Process the model list: determine the provider for each model based on priority rules
    const enrichedModelList = modelList.map((model) => {
      const enhancedModel: any = { ...model };

      // add pricing info
      const pricing = pricingMap.get(model.id);
      if (pricing) {
        // NewAPI pricing calculation logic:
        // - quota_type: 0 means pay-per-token, 1 means pay-per-call
        // - model_ratio: multiplier relative to base price (base price = $0.002/1K tokens)
        // - model_price: directly specified price (takes priority)
        // - completion_ratio: output price multiplier relative to input price
        //
        // LobeChat required format: USD per million tokens

        const pricingData = calculatePricing(pricing);
        if (pricingData) {
          enhancedModel.pricing = pricingData;
        }
      }

      return enhancedModel;
    });

    // Add models from pricing list that are not in the models list
    const additionalModels: any[] = [];
    pricingMap.forEach((pricing, modelName) => {
      if (!existingModelIds.has(modelName)) {
        const pricingData = calculatePricing(pricing);
        additionalModels.push({
          ...(pricing.description && { description: pricing.description }),
          id: modelName,
          ...(pricingData && { pricing: pricingData }),
        });
      }
    });

// 网关 pricing API 返回的 tags → LobeChat type 映射(网关自己的分类,100% 准确)
const PRICING_TAG_TO_TYPE: Record<string, string> = {
  视频生成: 'video',
  图片生成: 'image',
  文本生成: 'chat',
  文本向量: 'embedding',
};

const combinedModelList = [...enrichedModelList, ...additionalModels].map((model) => {
  const parametersOverride = MODEL_PARAMETERS_OVERRIDES[model.id];
  const pricing = pricingMap.get(model.id);
  // 优先用网关 pricing tags 做类型分类(网关自己的标签,最准确)
  const typeFromPricingTag = pricing?.tags ? PRICING_TAG_TO_TYPE[pricing.tags] : undefined;
  // 关键词兜底(pricing 没覆盖的模型)
  const isVideoByKeyword = VIDEO_MODEL_KEYWORDS.some((kw) =>
    model.id?.toLowerCase().includes(kw),
  );
  return {
    ...model,
    ...(isVideoByKeyword && { type: 'video' }), // 关键词先设(低优先级)
    ...(typeFromPricingTag && { type: typeFromPricingTag }), // 网关 tags 覆盖(高优先级)
    ...(parametersOverride && { parameters: parametersOverride }),
  };
});

    return processMultiProviderModelList(combinedModelList, 'newapi');
  },
  routers: (options, runtimeContext?: { model?: string }) => {
    const userBaseURL = options.baseURL?.replace(/\/v\d+[a-z]*\/?$/, '') || '';

    return [
      {
        apiType: 'anthropic',
        // newapi 是 OpenAI-compatible 网关,video 走 openai 子路由(/videos),不进 anthropic 原生
        models: LOBE_DEFAULT_MODEL_LIST.filter(
          (m) => detectModelProvider(m.id) === 'anthropic' && m.type !== 'video',
        ).map((m) => m.id),
        options: {
          ...options,
          baseURL: userBaseURL,
        },
      },
      {
        apiType: 'google',
        models: LOBE_DEFAULT_MODEL_LIST.filter(
          (m) => detectModelProvider(m.id) === 'google' && m.type !== 'video',
        ).map((m) => m.id),
        options: {
          ...options,
          baseURL: userBaseURL,
        },
      },
      {
        apiType: 'xai',
        models: LOBE_DEFAULT_MODEL_LIST.filter(
          (m) => detectModelProvider(m.id) === 'xai' && m.type !== 'video',
        ).map((m) => m.id),
        options: {
          ...options,
          baseURL: urlJoin(userBaseURL, '/v1'),
        },
      },
      {
        apiType: 'deepseek',
        models: resolveProviderRouteModels(
          'deepseek',
          LOBE_DEFAULT_MODEL_LIST,
          runtimeContext?.model,
        ),
        options: {
          ...options,
          baseURL: urlJoin(userBaseURL, '/v1'),
          sdkType: 'openai',
        },
      },
      {
        apiType: 'openai',
        options: {
          ...options,
          baseURL: urlJoin(userBaseURL, '/v1'),
          chatCompletion: {
            useResponseModels: [...Array.from(responsesAPIModels), /gpt-\d(?!\d)/, /^o\d/],
          },
        },
      },
    ];
  },
} satisfies CreateRouterRuntimeOptions;

export const LobeNewAPIAI = createRouterRuntime(params);
