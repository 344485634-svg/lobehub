import { useEffect, useMemo, useRef } from 'react';

import { useAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { useEnabledChatModels } from '@/hooks/useEnabledChatModels';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { type EnabledProviderWithModels } from '@/types/aiProvider';

interface ResolveChatInputNoticeParams {
  currentChatModel?: unknown;
  isHeterogeneousAgent: boolean;
  isModelConfigReady: boolean;
}

const findEnabledChatModel = (
  enabledChatModelList: EnabledProviderWithModels[],
  model: string,
  provider: string,
) => {
  return enabledChatModelList
    .find((item) => item.id === provider)
    ?.children.find((item) => item.id === model);
};

const findFirstEnabledChatModel = (enabledChatModelList: EnabledProviderWithModels[]) => {
  for (const provider of enabledChatModelList) {
    const first = provider.children?.[0];
    if (first?.id) {
      return { model: first.id, provider: provider.id };
    }
  }
  return null;
};

export const resolveChatInputNotice = ({
  currentChatModel,
  isHeterogeneousAgent,
  isModelConfigReady,
}: ResolveChatInputNoticeParams) => {
  // Model-config notices don't apply to heterogeneous agents (own toolchain) or
  // before the model runtime config is ready.
  if (!isHeterogeneousAgent && isModelConfigReady && !currentChatModel)
    return { action: undefined, key: 'input.modelUnavailable', type: 'warning' } as const;
};

/** Union of every notice shape `resolveChatInputNotice` can return. */
export type ChatInputNotice = NonNullable<ReturnType<typeof resolveChatInputNotice>>;

export const useChatInputNotice = (): ChatInputNotice | undefined => {
  const agentId = useAgentId();

  const [isHeterogeneousAgent, model, provider, updateAgentConfigById] = useAgentStore((s) => [
    agentByIdSelectors.isAgentHeterogeneousById(agentId)(s),
    agentByIdSelectors.getAgentModelById(agentId)(s),
    agentByIdSelectors.getAgentModelProviderById(agentId)(s),
    s.updateAgentConfigById,
  ]);

  const enabledChatModelList = useEnabledChatModels();
  const isModelConfigReady = useAiInfraStore((s) =>
    aiProviderSelectors.isInitAiProviderRuntimeState(s),
  );
  const currentChatModel = findEnabledChatModel(enabledChatModelList, model, provider);

  // Closed product: if agent still points to a removed default (e.g. deepseek),
  // auto-switch to the first available enabled chat model once.
  const autoFixedRef = useRef(false);
  useEffect(() => {
    if (autoFixedRef.current) return;
    if (isHeterogeneousAgent || !isModelConfigReady) return;
    if (currentChatModel) return;
    if (!enabledChatModelList.length) return;

    const next = findFirstEnabledChatModel(enabledChatModelList);
    if (!next || !agentId) return;

    autoFixedRef.current = true;
    void updateAgentConfigById(agentId, {
      model: next.model,
      provider: next.provider,
    });
  }, [
    agentId,
    currentChatModel,
    enabledChatModelList,
    isHeterogeneousAgent,
    isModelConfigReady,
    updateAgentConfigById,
  ]);

  return useMemo(
    () =>
      resolveChatInputNotice({
        currentChatModel,
        isHeterogeneousAgent,
        isModelConfigReady,
      }),
    [currentChatModel, isHeterogeneousAgent, isModelConfigReady],
  );
};
