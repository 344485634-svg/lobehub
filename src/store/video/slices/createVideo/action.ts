import { t } from 'i18next';

import { handleGenerationPromptModerationError } from '@/business/client/handleGenerationPromptModerationError';
import { handleLobeHubModelDeprecatedError } from '@/business/client/handleLobeHubModelDeprecatedError';
import { message } from '@/components/AntdStaticMethods';
import { videoService } from '@/services/video';
import { aiProviderSelectors, getAiInfraStoreState } from '@/store/aiInfra';
import { type StoreSetter } from '@/store/types';

import { type VideoStore } from '../../store';
import { generationBatchSelectors } from '../generationBatch/selectors';
import { videoGenerationConfigSelectors } from '../generationConfig/selectors';
import { generationTopicSelectors } from '../generationTopic';

type Setter = StoreSetter<VideoStore>;

export const createCreateVideoSlice = (set: Setter, get: () => VideoStore, _api?: unknown) =>
  new CreateVideoActionImpl(set, get, _api);

export class CreateVideoActionImpl {
  readonly #get: () => VideoStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => VideoStore, _api?: unknown) {
    void _api;
    this.#set = set;
    this.#get = get;
  }

  createVideo = async (): Promise<void> => {
    this.#set({ isCreating: true }, false, 'createVideo/startCreateVideo');

    // Guard:若当前模型不在已启用视频模型列表(如初始化前的已下架内置默认 dreamina-seedance),
    // 自动切到第一个启用的(如 sora-2),避免把已下架模型提交到服务端触发 LobeHubModelDeprecated。
    // prompt/参考图由 setModelAndProviderOnSelect 内的 preserveVideoInputParams 保留。
    const enabledVideoModelList = aiProviderSelectors.enabledVideoModelList(getAiInfraStoreState());
    const preStore = this.#get();
    const preProvider = videoGenerationConfigSelectors.provider(preStore);
    const preModel = videoGenerationConfigSelectors.model(preStore);
    const isCurrentVideoModelValid = enabledVideoModelList.some(
      (p) => p.id === preProvider && p.children.some((m) => m.id === preModel),
    );
    if (!isCurrentVideoModelValid) {
      const firstProvider = enabledVideoModelList[0];
      const firstModel = firstProvider?.children?.[0];
      if (!firstProvider || !firstModel) {
        message.warning({
          content: t('ModelSwitchPanel.emptyProvider', { ns: 'components' }),
          duration: 3,
        });
        this.#set({ isCreating: false }, false, 'createVideo/noEnabledVideoModel');
        return;
      }
      // 防御:自动切模型若异常,复位 isCreating 避免发送按钮卡住,再向上抛由调用方处理。
      try {
        this.#get().setModelAndProviderOnSelect(firstModel.id, firstProvider.id);
      } catch (e) {
        this.#set({ isCreating: false }, false, 'createVideo/autoSelectFailed');
        throw e;
      }
    }

    const store = this.#get();
    const parameters = videoGenerationConfigSelectors.parameters(store);
    const provider = videoGenerationConfigSelectors.provider(store);
    const model = videoGenerationConfigSelectors.model(store);
    const activeGenerationTopicId = generationTopicSelectors.activeGenerationTopicId(store);
    const { createGenerationTopic, switchGenerationTopic, setTopicBatchLoaded } = store;

    if (!parameters) {
      throw new TypeError('parameters is not initialized');
    }

    if (!parameters.prompt) {
      throw new TypeError('prompt is empty');
    }

    // Validate: end frame requires start frame (driven by model schema)
    const parametersSchema = videoGenerationConfigSelectors.parametersSchema(store);
    const endImageUrlSchema = parametersSchema?.endImageUrl;
    if (
      endImageUrlSchema &&
      'requiresImageUrl' in endImageUrlSchema &&
      endImageUrlSchema.requiresImageUrl &&
      parameters.endImageUrl &&
      !parameters.imageUrl &&
      !parameters.imageUrls?.length
    ) {
      message.warning({
        content: t('generation.validation.endFrameRequiresStartFrame', { ns: 'video' }),
        duration: 3,
      });
      this.#set({ isCreating: false }, false, 'createVideo/endCreateVideo');
      return;
    }

    let finalTopicId = activeGenerationTopicId;

    // 1. Create generation topic if not exists
    const generationTopicId = activeGenerationTopicId;
    let isNewTopic = false;

    if (!generationTopicId) {
      isNewTopic = true;
      const prompts = [parameters.prompt];
      const newGenerationTopicId = await createGenerationTopic(prompts);
      finalTopicId = newGenerationTopicId;

      // 2. Initialize empty batch array to avoid skeleton screen
      setTopicBatchLoaded(newGenerationTopicId);

      // 3. Switch to the new topic (now it has empty data, so no skeleton screen)
      switchGenerationTopic(newGenerationTopicId);
    }

    try {
      // 3. If it's a new topic, set the creating state after topic creation
      if (isNewTopic) {
        this.#set(
          { isCreatingWithNewTopic: true },
          false,
          'createVideo/startCreateVideoWithNewTopic',
        );
      }

      // 4. Create video via service
      await videoService.createVideo({
        generationTopicId: finalTopicId!,
        model,
        params: parameters as any,
        provider,
      });

      // 5. Refresh generation batches to show the new batch
      if (!isNewTopic) {
        await this.#get().refreshGenerationBatches();
      }

      // 6. Clear the prompt input after successful video creation
      this.#set(
        (state) => ({
          parameters: { ...state.parameters, prompt: '' },
        }),
        false,
        'createVideo/clearPrompt',
      );
    } catch (error) {
      handleGenerationPromptModerationError(error);
      handleLobeHubModelDeprecatedError(error);
      throw error;
    } finally {
      // 7. Reset all creating states
      if (isNewTopic) {
        this.#set(
          { isCreating: false, isCreatingWithNewTopic: false },
          false,
          'createVideo/endCreateVideoWithNewTopic',
        );
      } else {
        this.#set({ isCreating: false }, false, 'createVideo/endCreateVideo');
      }
    }
  };

  recreateVideo = async (generationBatchId: string): Promise<void> => {
    this.#set({ isCreating: true }, false, 'recreateVideo/start');

    const store = this.#get();
    const activeGenerationTopicId = generationTopicSelectors.activeGenerationTopicId(store);
    if (!activeGenerationTopicId) {
      throw new Error('No active generation topic');
    }

    const { removeGenerationBatch } = store;
    const batch = generationBatchSelectors.getGenerationBatchByBatchId(generationBatchId)(store)!;

    try {
      await removeGenerationBatch(generationBatchId, activeGenerationTopicId);

      await videoService.createVideo({
        generationTopicId: activeGenerationTopicId,
        model: batch.model,
        params: batch.config as any,
        provider: batch.provider,
      });

      await store.refreshGenerationBatches();
    } catch (error) {
      handleGenerationPromptModerationError(error);
      handleLobeHubModelDeprecatedError(error);
      throw error;
    } finally {
      this.#set({ isCreating: false }, false, 'recreateVideo/end');
    }
  };
}

export type CreateVideoAction = Pick<CreateVideoActionImpl, keyof CreateVideoActionImpl>;
