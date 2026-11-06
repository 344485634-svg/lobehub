import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';
import { ModelProvider } from 'model-bank';

import { composioEnv } from '@/config/composio';
import { isDesktop } from '@/const/version';
import { appEnv, getAppConfig } from '@/envs/app';
import { authEnv } from '@/envs/auth';
import { fileEnv } from '@/envs/file';
import { imageEnv } from '@/envs/image';
import { knowledgeEnv } from '@/envs/knowledge';
import { langfuseEnv } from '@/envs/langfuse';
import { toolsEnv } from '@/envs/tools';
import { parseSSOProviders } from '@/libs/better-auth/utils/server';
import { parseSystemAgent } from '@/server/globalConfig/parseSystemAgent';
import { type GlobalServerConfig } from '@/types/serverConfig';
import { cleanObject } from '@/utils/object';

import {
  genServerAiProvidersConfig,
  type ProviderSpecificConfig,
} from './genServerAiProviderConfig';
import { parseAgentConfig } from './parseDefaultAgent';
import { parseFilesConfig } from './parseFilesConfig';
import { getPublicMemoryExtractionConfig } from './parseMemoryExtractionConfig';

/**
 * Get Better-Auth SSO providers list
 * Parses AUTH_SSO_PROVIDERS and returns enabled providers
 */
const getBetterAuthSSOProviders = () => {
  return parseSSOProviders(authEnv.AUTH_SSO_PROVIDERS);
};

/**
 * 合并 env 与 admin DB 动态配置的 SSO provider 列表(登录按钮显隐依据)。
 * DB 读取失败时回退 env(相当于未配置动态微信)。
 */
const getMergedSSOProviders = async (): Promise<string[]> => {
  const envProviders = getBetterAuthSSOProviders();
  try {
    const { getDynamicAuthConfig } = await import('@/libs/better-auth/define-config');
    const { WECHAT_MP_PROVIDER_ID } = await import(
      '@/libs/better-auth/sso/providers/wechat-mp'
    );
    const dyn = await getDynamicAuthConfig();
    if (dyn?.wechat) {
      return [...new Set([...envProviders, WECHAT_MP_PROVIDER_ID])];
    }
  } catch {
    // DB 未就绪(构建期/早启动)
  }
  return envProviders;
};

/** admin 后台短信开关(DB),决定登录页是否显示手机验证码表单 */
const getDynamicEnablePhoneLogin = async (): Promise<boolean> => {
  try {
    const { getDynamicAuthConfig } = await import('@/libs/better-auth/define-config');
    const dyn = await getDynamicAuthConfig();
    return Boolean(dyn?.sms?.enabled);
  } catch {
    return false;
  }
};

export const getServerGlobalConfig = async () => {
  const { DEFAULT_AGENT_CONFIG } = getAppConfig();

  const aiProviderSpecificConfig: Record<string, ProviderSpecificConfig> = {
    azure: {
      enabledKey: 'ENABLED_AZURE_OPENAI',
      withDeploymentName: true,
    },
    azureai: {
      withDeploymentName: true,
    },
    bedrock: {
      enabledKey: 'ENABLED_AWS_BEDROCK',
      modelListKey: 'AWS_BEDROCK_MODEL_LIST',
    },
    deepseek: {
      enabled: true,
    },
    giteeai: {
      enabledKey: 'ENABLED_GITEE_AI',
      modelListKey: 'GITEE_AI_MODEL_LIST',
    },
    kimicodingplan: {
      withDeploymentName: true,
    },
    lmstudio: {
      fetchOnClient: isDesktop ? false : undefined,
    },
    ollama: {
      enabled: isDesktop ? true : undefined,
      fetchOnClient: isDesktop ? false : !process.env.OLLAMA_PROXY_URL,
    },
    ollamacloud: {
      enabledKey: 'ENABLED_OLLAMA_CLOUD',
    },
    qwen: {
      withDeploymentName: true,
    },
    spark: {
      withDeploymentName: true,
    },
    tencentcloud: {
      enabledKey: 'ENABLED_TENCENT_CLOUD',
      modelListKey: 'TENCENT_CLOUD_MODEL_LIST',
    },
    volcengine: {
      withDeploymentName: true,
    },
    volcenginecodingplan: {
      withDeploymentName: true,
    },
  };

  // In business feature mode, keep the built-in provider as the only default-enabled
  // provider while preserving provider-specific metadata such as fetch/model-list keys.
  // Non-business builds keep the upstream defaults.
  if (ENABLE_BUSINESS_FEATURES) {
    for (const provider of Object.values(ModelProvider)) {
      aiProviderSpecificConfig[provider] = {
        ...aiProviderSpecificConfig[provider],
        enabled: provider === ModelProvider.LobeHub,
      };
    }
  }

  const config: GlobalServerConfig = {
    aiProvider: await genServerAiProvidersConfig(aiProviderSpecificConfig),
    defaultAgent: {
      config: parseAgentConfig(DEFAULT_AGENT_CONFIG),
    },
    disableEmailPassword: authEnv.AUTH_DISABLE_EMAIL_PASSWORD,
    enableBusinessFeatures: ENABLE_BUSINESS_FEATURES,
    enableEmailVerification: authEnv.AUTH_EMAIL_VERIFICATION,
    enableComposio: !!composioEnv.COMPOSIO_API_KEY,
    enableGatewayMode:
      ENABLE_BUSINESS_FEATURES || (!!appEnv.ENABLE_AGENT_GATEWAY && !!appEnv.AGENT_GATEWAY_URL),
    enableLobehubSkill: !!(appEnv.MARKET_TRUSTED_CLIENT_SECRET && appEnv.MARKET_TRUSTED_CLIENT_ID),
    enableMagicLink: authEnv.AUTH_ENABLE_MAGIC_LINK,
    enableMarketTrustedClient: !!(
      appEnv.MARKET_TRUSTED_CLIENT_SECRET && appEnv.MARKET_TRUSTED_CLIENT_ID
    ),
    enableUploadFileToServer: !!fileEnv.S3_SECRET_ACCESS_KEY,
    enableVisualUnderstanding: !!(
      toolsEnv.VISUAL_UNDERSTANDING_PROVIDER && toolsEnv.VISUAL_UNDERSTANDING_MODEL
    ),
    ...(toolsEnv.VISUAL_UNDERSTANDING_PROVIDER && toolsEnv.VISUAL_UNDERSTANDING_MODEL
      ? {
          visualUnderstanding: {
            model: toolsEnv.VISUAL_UNDERSTANDING_MODEL,
            provider: toolsEnv.VISUAL_UNDERSTANDING_PROVIDER,
          },
        }
      : undefined),

    // Expose Agent Gateway URL to client (used by hetero agents; also required for queue mode)
    ...(appEnv.AGENT_GATEWAY_URL ? { agentGatewayUrl: appEnv.AGENT_GATEWAY_URL } : undefined),

    image: cleanObject({
      defaultImageNum: imageEnv.AI_IMAGE_DEFAULT_IMAGE_NUM,
    }),
    memory: {
      userMemory: cleanObject(getPublicMemoryExtractionConfig()),
    },
    oAuthSSOProviders: await getMergedSSOProviders(),
    // admin DB 动态开关:手机验证码登录
    enablePhoneLogin: await getDynamicEnablePhoneLogin(),
    systemAgent: parseSystemAgent(appEnv.SYSTEM_AGENT),
    telemetry: {
      langfuse: langfuseEnv.ENABLE_LANGFUSE,
    },
  };

  return config;
};

export const getServerDefaultAgentConfig = () => {
  const { DEFAULT_AGENT_CONFIG } = getAppConfig();

  return parseAgentConfig(DEFAULT_AGENT_CONFIG) || {};
};

export const getServerDefaultFilesConfig = () => {
  return parseFilesConfig(knowledgeEnv.DEFAULT_FILES_CONFIG);
};
