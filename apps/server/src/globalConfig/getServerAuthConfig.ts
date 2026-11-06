import { ENABLE_BUSINESS_FEATURES } from '@lobechat/business-const';

import { appEnv } from '@/envs/app';
import { authEnv } from '@/envs/auth';
import { parseSSOProviders } from '@/libs/better-auth/utils/server';
import { WECHAT_MP_PROVIDER_ID } from '@/libs/better-auth/sso/providers/wechat-mp';
import { getDynamicAuthConfig } from '@/libs/better-auth/define-config';
import { type GlobalServerConfig } from '@/types/serverConfig';

const getBetterAuthSSOProviders = () => {
  return parseSSOProviders(authEnv.AUTH_SSO_PROVIDERS);
};

/**
 * 合并 env 与 admin 后台 DB 配置的动态 SSO provider 列表。
 * admin 启用微信(公众号/开放平台)时,客户端登录页会出现对应登录按钮。
 */
const getMergedSSOProviders = async (): Promise<string[]> => {
  const envProviders = getBetterAuthSSOProviders();
  try {
    const dyn = await getDynamicAuthConfig();
    if (dyn?.wechat) {
      return [...new Set([...envProviders, WECHAT_MP_PROVIDER_ID])];
    }
  } catch {
    // DB 未就绪时退回 env 配置
  }
  return envProviders;
};

export const getServerAuthConfig = async (): Promise<GlobalServerConfig> => {
  return {
    aiProvider: {},
    disableEmailPassword: authEnv.AUTH_DISABLE_EMAIL_PASSWORD,
    enableBusinessFeatures: ENABLE_BUSINESS_FEATURES,
    enableEmailVerification: authEnv.AUTH_EMAIL_VERIFICATION,
    enableMagicLink: authEnv.AUTH_ENABLE_MAGIC_LINK,
    enableMarketTrustedClient: !!(
      appEnv.MARKET_TRUSTED_CLIENT_SECRET && appEnv.MARKET_TRUSTED_CLIENT_ID
    ),
    enablePhoneLogin: await (async () => {
      try {
        const dyn = await getDynamicAuthConfig();
        return Boolean(dyn?.sms?.enabled);
      } catch {
        return false;
      }
    })(),
    oAuthSSOProviders: await getMergedSSOProviders(),
    telemetry: {},
  };
};
