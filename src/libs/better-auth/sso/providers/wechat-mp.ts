import { type GenericOAuthConfig } from 'better-auth/plugins';

import type { AuthWechatConfig } from '@/database/schemas/systemConfig';

/**
 * 微信公众号(服务号)网页授权 provider —— admin 后台动态配置(auth.wechat)。
 *
 * 流程:
 * - 手机端:用户在微信内打开登录页 → 直接跳转 authorize URL(snsapi_userinfo)→ 回调登录。
 * - PC 端:展示「带参二维码」(qrcode 接口,scene 即 state)→ 用户扫码进入公众号会话 →
 *   通过公众号客服消息/模板消息推送登录链接(需要公众号已开对应能力)。
 *   若公众号未开启消息能力,PC 端提示用户改用手机微信访问(扫码即跳转 H5 授权页)。
 *
 * 微信公众号授权的非标准点(与 OAuth2 的差异)均在此处理:
 * - authorize 地址固定为 open.weixin.qq.com/connect/oauth2/authorize,appid/scope 走 query;
 * - token 交换为 GET + appid/secret/code,响应含 openid;
 * - userinfo 拉取 snsapi_userinfo 可得昵称/头像,openid 字段须传回。
 */

const MP_AUTHORIZATION_URL = 'https://open.weixin.qq.com/connect/oauth2/authorize';
const MP_TOKEN_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token';
const MP_USERINFO_URL = 'https://api.weixin.qq.com/sns/userinfo';

type WechatMpTokenResponse = {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
  openid?: string;
  refresh_token?: string;
  scope?: string;
};

type WechatMpUserInfo = {
  headimgurl?: string;
  nickname?: string;
  openid: string;
  unionid?: string;
};

export const WECHAT_MP_PROVIDER_ID = 'wechat-mp';

/**
 * Build a generic-oauth provider config from a DB-loaded admin config.
 * Returns null when the config is disabled or incomplete.
 */
export const buildWechatMpProvider = (cfg: AuthWechatConfig): GenericOAuthConfig | null => {
  if (!cfg.enabled || !cfg.appId || !cfg.appSecret) return null;

  const clientId = cfg.appId;
  const clientSecret = cfg.appSecret;
  const scope = 'snsapi_userinfo';

  return {
    authorizationUrl: MP_AUTHORIZATION_URL,
    authorizationUrlParams: {
      appid: clientId,
      response_type: 'code',
      scope,
    },
    clientId,
    clientSecret,
    /**
     * 与开放平台一样,公众号 token 接口是非标准 GET。
     */
    getToken: async ({ code }) => {
      const url = new URL(MP_TOKEN_URL);
      url.searchParams.set('appid', clientId);
      url.searchParams.set('secret', clientSecret);
      url.searchParams.set('code', code);
      url.searchParams.set('grant_type', 'authorization_code');

      const response = await fetch(url, { cache: 'no-store' });
      const data = (await response.json()) as WechatMpTokenResponse;

      if (!response.ok || data.errcode) {
        throw new Error(data.errmsg ?? 'Failed to fetch WeChat MP OAuth token');
      }
      if (!data.access_token || !data.openid) {
        throw new Error('WeChat MP token response is missing required fields');
      }

      return {
        accessToken: data.access_token,
        accessTokenExpiresAt: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : undefined,
        expiresIn: data.expires_in,
        raw: data,
        refreshToken: data.refresh_token,
        scopes: (data.scope || '').split(' ').filter(Boolean),
        tokenType: 'Bearer',
      };
    },
    getUserInfo: async (tokens) => {
      const raw = (tokens as { raw?: WechatMpTokenResponse }).raw;
      const openId = raw?.openid;
      if (!openId) return null;

      const url = new URL(MP_USERINFO_URL);
      url.searchParams.set('access_token', tokens.accessToken as string);
      url.searchParams.set('openid', openId);
      url.searchParams.set('lang', 'zh_CN');

      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;

      const profile = (await response.json()) as WechatMpUserInfo;
      const uid = profile.unionid ?? openId;
      // better-auth 要求非空 email;以 openid 合成占位邮箱(携带 unionid 优先,保证同主体下账号唯一)
      const syntheticEmail = `${uid}@wechat.user`;

      return {
        email: syntheticEmail,
        emailVerified: false,
        id: uid,
        image: profile.headimgurl,
        name: profile.nickname || uid,
        ...profile,
      };
    },

    pkce: false,
    providerId: WECHAT_MP_PROVIDER_ID,
    responseMode: 'query',
    scopes: [scope],
    tokenUrl: MP_TOKEN_URL,
  };
};
