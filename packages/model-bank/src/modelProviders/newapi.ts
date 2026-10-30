import type { ModelProviderCard } from '@/types/llm';

const NewAPI: ModelProviderCard = {
  chatModels: [],
  checkModel: 'gpt-4o-mini',
  description: 'ChatX 官方模型聚合与路由服务',
  enabled: true,
  id: 'newapi',
  name: 'ChatX',
  settings: {
    proxyUrl: {
      placeholder: 'https://api.chatx.ai/v1',
    },
    sdkType: 'router',
    showModelFetcher: true,
    supportResponsesApi: true,
  },
  url: '',
};

export default NewAPI;
