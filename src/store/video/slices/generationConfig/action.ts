import {
  type AIVideoModelCard,
  extractVideoDefaultValues,
  type RuntimeVideoGenParams,
  type RuntimeVideoGenParamsKeys,
  type RuntimeVideoGenParamsValue,
  type VideoModelParamsSchema,
} from 'model-bank';

import { aiProviderSelectors, getAiInfraStoreState } from '@/store/aiInfra';
import { useGlobalStore } from '@/store/global';
import { type StoreSetter } from '@/store/types';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import {
  normalizeImageInputOnSchemaSwitch,
  preserveSupportedParams,
} from '../../../utils/preserveSupportedParams';
import type { VideoStore } from '../../store';
import { DEFAULT_VIDEO_GENERATION_PARAMETERS, initialGenerationConfigState } from './initialState';

export function getVideoModelAndDefaults(model: string, provider: string) {
  const enabledVideoModelList = aiProviderSelectors.enabledVideoModelList(getAiInfraStoreState());

  const providerItem = enabledVideoModelList.find((providerItem) => providerItem.id === provider);
  if (!providerItem) {
    throw new Error(
      `Provider "${provider}" not found in enabled video provider list. Available providers: ${enabledVideoModelList.map((p) => p.id).join(', ')}`,
    );
  }

  const activeModel = providerItem.children.find(
    (modelItem) => modelItem.id === model,
  ) as unknown as AIVideoModelCard;
  if (!activeModel) {
    throw new Error(
      `Model "${model}" not found in provider "${provider}". Available models: ${providerItem.children.map((m) => m.id).join(', ')}`,
    );
  }

  // 模型可能缺少有效视频参数 schema(如从网关拉取、DB parameters 为空 {} 的 sora-2),
  // 此时 extractVideoDefaultValues 会因 VideoModelParamsMetaSchema 必填 prompt 而抛错,
  // 导致选模型/生成都失败。回退到默认视频 schema,使选择与生成可用(封闭产品只走自有网关模型)。
  //
  // 网关模型(非 model-bank 内置)的管理员配置可能是稀疏的 —— 例如只配了支持的
  // 分辨率。此时把配置叠加在通用视频 schema 之上(只覆盖配置过的键),让
  // 比例/时长等标准控件保持可用;model-bank 内置模型保持整份使用其精调 schema。
  let parametersSchema: VideoModelParamsSchema;
  let defaultValues: RuntimeVideoGenParams;
  try {
    const modelParams = (activeModel.parameters ?? undefined) as VideoModelParamsSchema;
    const hasOwnSchema = !!modelParams && Object.keys(modelParams).length > 0;
    // 只有明确来自网关的模型(remote/custom)才做叠加;无 source 的模型保持
    // 旧行为(整份使用 schema),内置模型(builtin)沿用其精调 schema。
    const modelSource = (activeModel as any).source as string | undefined;
    const isGatewayModel = modelSource === 'remote' || modelSource === 'custom';
    parametersSchema =
      hasOwnSchema && isGatewayModel
        ? { ...initialGenerationConfigState.parametersSchema, ...modelParams }
        : (modelParams ?? initialGenerationConfigState.parametersSchema);
    defaultValues = extractVideoDefaultValues(parametersSchema);
  } catch {
    parametersSchema = initialGenerationConfigState.parametersSchema;
    defaultValues = DEFAULT_VIDEO_GENERATION_PARAMETERS;
  }

  return { activeModel, defaultValues, parametersSchema };
}

function preserveVideoInputParams(
  previousParameters: RuntimeVideoGenParams,
  nextDefaultValues: RuntimeVideoGenParams,
  nextSchema: VideoModelParamsSchema,
) {
  const result = preserveSupportedParams(previousParameters, nextDefaultValues, nextSchema, [
    'prompt',
    'imageUrl',
    'imageUrls',
    'endImageUrl',
  ]);

  return normalizeImageInputOnSchemaSwitch(previousParameters, nextSchema, result);
}

type Setter = StoreSetter<VideoStore>;

export const createGenerationConfigSlice = (set: Setter, get: () => VideoStore, _api?: unknown) =>
  new GenerationConfigActionImpl(set, get, _api);

export class GenerationConfigActionImpl {
  readonly #get: () => VideoStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => VideoStore, _api?: unknown) {
    void _api;
    this.#get = get;
    this.#set = set;
  }

  initializeVideoConfig = (
    isLogin?: boolean,
    lastSelectedVideoModel?: string,
    lastSelectedVideoProvider?: string,
  ): void => {
    if (isLogin && lastSelectedVideoModel && lastSelectedVideoProvider) {
      try {
        const { defaultValues, parametersSchema } = getVideoModelAndDefaults(
          lastSelectedVideoModel,
          lastSelectedVideoProvider,
        );

        this.#set(
          {
            isInit: true,
            model: lastSelectedVideoModel,
            parameters: defaultValues,
            parametersSchema,
            provider: lastSelectedVideoProvider,
          },
          false,
          `initializeVideoConfig/${lastSelectedVideoModel}/${lastSelectedVideoProvider}`,
        );
      } catch {
        this.#set({ isInit: true }, false, 'initializeVideoConfig/default');
      }
    } else {
      this.#set({ isInit: true }, false, 'initializeVideoConfig/default');
    }
  };

  setModelAndProviderOnSelect = (model: string, provider: string): void => {
    const previousParameters = this.#get().parameters;
    const { defaultValues, parametersSchema } = getVideoModelAndDefaults(model, provider);
    const parameters = preserveVideoInputParams(
      previousParameters,
      defaultValues,
      parametersSchema,
    );

    this.#set(
      {
        model,
        parameters,
        parametersSchema,
        provider,
      },
      false,
      `setModelAndProviderOnSelect/${model}/${provider}`,
    );

    const isLogin = authSelectors.isLogin(useUserStore.getState());
    if (isLogin) {
      useGlobalStore.getState().updateSystemStatus({
        lastSelectedVideoModel: model,
        lastSelectedVideoProvider: provider,
      });
    }
  };

  setParamOnInput = <K extends RuntimeVideoGenParamsKeys>(
    paramName: K,
    value: RuntimeVideoGenParamsValue,
  ): void => {
    this.#set(
      (state) => {
        const { parameters } = state;
        return { parameters: { ...parameters, [paramName]: value } };
      },
      false,
      `setParamOnInput/${paramName}`,
    );
  };

  addUploadingImagePreviews = (urls: string[]): void => {
    this.#set(
      (state) => ({ uploadingImagePreviews: [...state.uploadingImagePreviews, ...urls] }),
      false,
      'addUploadingImagePreviews',
    );
  };

  removeUploadingImagePreviews = (urls: string[]): void => {
    this.#set(
      (state) => ({
        uploadingImagePreviews: state.uploadingImagePreviews.filter((url) => !urls.includes(url)),
      }),
      false,
      'removeUploadingImagePreviews',
    );
  };
}

export type GenerationConfigAction = Pick<
  GenerationConfigActionImpl,
  keyof GenerationConfigActionImpl
>;
