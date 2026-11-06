import { expo } from '@better-auth/expo';
import { passkey } from '@better-auth/passkey';
import { createNanoId, idGenerator, serverDB } from '@lobechat/database';
import * as schema from '@lobechat/database/schemas';
import { type AuthSmsConfig, type AuthWechatConfig } from '@/database/schemas/systemConfig';
import { SystemConfigModel } from '@/database/models/systemConfig';
import bcrypt from 'bcryptjs';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { verifyPassword as defaultVerifyPassword } from 'better-auth/crypto';
import { type BetterAuthOptions } from 'better-auth/minimal';
import { betterAuth } from 'better-auth/minimal';
import { admin, emailOTP, genericOAuth, magicLink, phoneNumber } from 'better-auth/plugins';
import { type BetterAuthPlugin, type BetterAuthOptions as BAOptions } from 'better-auth/types';
import { eq } from 'drizzle-orm';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

import { appEnv } from '@/envs/app';
import { authEnv } from '@/envs/auth';
import {
  getChangeEmailVerificationTemplate,
  getMagicLinkEmailTemplate,
  getResetPasswordEmailTemplate,
  getVerificationEmailTemplate,
  getVerificationOTPEmailTemplate,
} from '@/libs/better-auth/email-templates';
import { emailWhitelist } from '@/libs/better-auth/plugins/email-whitelist';
import { initBetterAuthSSOProviders } from '@/libs/better-auth/sso';
import { buildWechatMpProvider, WECHAT_MP_PROVIDER_ID } from '@/libs/better-auth/sso/providers/wechat-mp';
import { createSecondaryStorage, getTrustedOrigins } from '@/libs/better-auth/utils/config';
import { parseSSOProviders } from '@/libs/better-auth/utils/server';
import { generateNumericOtp, sendAliyunSms } from '@/libs/sms/aliyun';
import { EmailService } from '@/server/services/email';
import { UserService } from '@/server/services/user';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

const LOCAL_NO_PROXY_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export const mergeLocalNoProxy = (noProxy?: string): string => {
  const entries = new Set(
    (noProxy || '')
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  if (entries.has('*')) return '*';

  for (const host of LOCAL_NO_PROXY_HOSTS) {
    entries.add(host);
  }

  return [...entries].join(',');
};

// Configure HTTP proxy for OAuth provider requests in development (e.g., Google token exchange).
// Node.js native fetch doesn't respect system proxy settings. Keep localhost direct so Next can
// fetch local Vite templates such as /index.auth.html without depending on the system proxy.
// Ref: https://github.com/better-auth/better-auth/issues/7396
if (process.env.NODE_ENV === 'development') {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || httpProxy;

  if (httpProxy || httpsProxy) {
    const proxyAgent = new EnvHttpProxyAgent({
      ...(httpProxy && { httpProxy }),
      ...(httpsProxy && { httpsProxy }),
      noProxy: mergeLocalNoProxy(process.env.NO_PROXY || process.env.no_proxy),
    });
    setGlobalDispatcher(proxyAgent);
  }
}

// Email verification link expiration time (in seconds)
// Default is 1 hour (3600 seconds) as per Better Auth documentation
const VERIFICATION_LINK_EXPIRES_IN = 3600;

/**
 * Safely extract hostname from APP_URL for passkey rpID.
 * Returns undefined if APP_URL is not set (e.g., in e2e tests).
 */
const getPasskeyRpID = (): string | undefined => {
  if (!appEnv.APP_URL) return undefined;
  try {
    return new URL(appEnv.APP_URL).hostname;
  } catch {
    return undefined;
  }
};

/**
 * Get passkey origins array.
 * Returns undefined if APP_URL is not set (e.g., in e2e tests).
 */
const getPasskeyOrigins = (): string[] | undefined => {
  if (!appEnv.APP_URL) return undefined;
  try {
    return [new URL(appEnv.APP_URL).origin];
  } catch {
    return undefined;
  }
};
const MAGIC_LINK_EXPIRES_IN = 900;
// OTP expiration time (in seconds) - 5 minutes for mobile OTP verification
const OTP_EXPIRES_IN = 300;
const enableMagicLink = authEnv.AUTH_ENABLE_MAGIC_LINK;
const enabledSSOProviders = parseSSOProviders(authEnv.AUTH_SSO_PROVIDERS);

const { socialProviders, genericOAuthProviders } = initBetterAuthSSOProviders();

/**
 * ===== Admin 后台动态认证配置(注册登录配置) =====
 * 微信(公众号网页授权)与阿里云短信的凭据来自 system_configs 表(auth.wechat / auth.sms),
 * 由管理员在 /admin/auth 页面维护,而非环境变量。
 * 本模块在服务启动/首次使用时加载一次;admin 保存配置后调用 bumpAuthConfigVersion()
 * 使下一次 auth 实例创建时重读 DB(轻量缓存,避免每次请求查库+解密)。
 */

let authConfigCache: {
  sms?: AuthSmsConfig;
  version: number;
  wechat?: AuthWechatConfig;
} | null = null;

let authConfigVersion = 0;
let loadedAuthConfigVersion = -1;

/** admin 保存认证配置后调用:使缓存的 DB 配置失效,下次构建 auth 实例时重读。 */
export const bumpAuthConfigVersion = () => {
  authConfigVersion += 1;
};

const loadAuthConfigFromDB = async (): Promise<void> => {
  if (authConfigCache && loadedAuthConfigVersion === authConfigVersion) return;
  try {
    const model = new SystemConfigModel(serverDB);
    const [wechat, sms] = await Promise.all([
      model.getAuthWechatConfig(),
      model.getAuthSmsConfig(),
    ]);

    // 解密敏感字段(secret 为 AES-GCM 密文,由 KeyVaultsGateKeeper 加密入库)
    let wechatPlain: AuthWechatConfig | undefined = wechat;
    if (wechat?.appSecret) {
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      const { plaintext, wasAuthentic } = await gateKeeper.decrypt(wechat.appSecret);
      wechatPlain = wasAuthentic ? { ...wechat, appSecret: plaintext } : undefined;
    }

    let smsPlain: AuthSmsConfig | undefined = sms;
    if (sms?.accessKeySecret) {
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      const { plaintext, wasAuthentic } = await gateKeeper.decrypt(sms.accessKeySecret);
      smsPlain = wasAuthentic ? { ...sms, accessKeySecret: plaintext } : undefined;
    }

    authConfigCache = {
      sms: smsPlain?.enabled ? smsPlain : undefined,
      version: authConfigVersion,
      wechat: wechatPlain?.enabled ? wechatPlain : undefined,
    };
    loadedAuthConfigVersion = authConfigVersion;
  } catch (e) {
    // DB 不可达(如早期启动阶段)时保持禁用,不阻塞认证服务本身
    authConfigCache = { version: authConfigVersion };
    loadedAuthConfigVersion = authConfigVersion;
    console.warn('[auth] Failed to load dynamic auth config from DB:', e);
  }
};

/** 外部(如 admin 设置页)读取当前生效的动态认证配置(已解密,慎用) */
export const getDynamicAuthConfig = async () => {
  await loadAuthConfigFromDB();
  return authConfigCache;
};

interface CustomBetterAuthOptions {
  plugins: BetterAuthPlugin[];
}

export async function defineConfig(customOptions: CustomBetterAuthOptions) {
  await loadAuthConfigFromDB();

  const dynWechatCfg = authConfigCache?.wechat;
  const dynSmsCfg = authConfigCache?.sms;

  // 动态微信(公众号)provider:合并进 env 驱动的 provider 结果
  const mergedSocialProviders = { ...socialProviders };
  const mergedGenericProviders = [...genericOAuthProviders];
  const mergedEnabledProviders = [...enabledSSOProviders];

  const wechatMp = dynWechatCfg ? buildWechatMpProvider(dynWechatCfg) : null;
  if (wechatMp) {
    wechatMp.redirectURI = `${appEnv.APP_URL}/api/auth/callback/${WECHAT_MP_PROVIDER_ID}`;
    mergedGenericProviders.push(wechatMp);
    mergedEnabledProviders.push(WECHAT_MP_PROVIDER_ID);
  }

  const options = {
    account: {
      accountLinking: {
        allowDifferentEmails: true,
        enabled: true,
        trustedProviders: mergedEnabledProviders,
      },
    },

    baseURL: appEnv.APP_URL,
    secret: authEnv.AUTH_SECRET,
    trustedOrigins: getTrustedOrigins(mergedEnabledProviders),

    emailAndPassword: {
      autoSignIn: true,
      disableSignUp: authEnv.AUTH_DISABLE_EMAIL_PASSWORD,
      enabled: !authEnv.AUTH_DISABLE_EMAIL_PASSWORD,
      maxPasswordLength: 64,
      minPasswordLength: 8,
      requireEmailVerification: authEnv.AUTH_EMAIL_VERIFICATION,
      revokeSessionsOnPasswordReset: true,

      // Compatible with bcrypt password hashes migrated from Clerk; after login, you can re-hash in the backend using BetterAuth's default scrypt.
      password: {
        // New passwords continue to use BetterAuth's default hash to stay consistent with the official configuration.
        async verify({ hash, password }: { hash: string; password: string }): Promise<boolean> {
          if (!hash) return false;

          // Compatible with bcrypt hashes exported from Clerk (starting with $2a$ or $2b$)
          if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
            return bcrypt.compare(password, hash);
          }

          // For all other cases, use BetterAuth's default verification
          return defaultVerifyPassword({ hash, password });
        },
      },

      sendResetPassword: async ({ user, url }) => {
        const template = getResetPasswordEmailTemplate({ url });

        // Prefer admin DB SMTP config when available
        let emailService: EmailService;
        try {
          const { getServerDB } = await import('@/database/server');
          const db = await getServerDB();
          emailService = await EmailService.createFromSystemConfig(db);
        } catch {
          emailService = new EmailService();
        }
        await emailService.sendMail({
          to: user.email,
          ...template,
        });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_LINK_EXPIRES_IN,
      sendVerificationEmail: async ({ user, url }, request) => {
        // Skip sending verification link email for mobile clients (Expo/React Native)
        // Mobile clients use OTP verification instead, triggered manually via emailOTP plugin
        if (request?.headers?.get?.('x-client-type') === 'mobile') {
          return;
        }

        // Use different template for change-email vs signup verification
        const isChangeEmail = request?.url?.includes('/change-email');
        const template = isChangeEmail
          ? getChangeEmailVerificationTemplate({
              expiresInSeconds: VERIFICATION_LINK_EXPIRES_IN,
              url,
              userName: user.name,
            })
          : getVerificationEmailTemplate({
              expiresInSeconds: VERIFICATION_LINK_EXPIRES_IN,
              url,
              userName: user.name,
            });

        let emailService: EmailService;
        try {
          const { getServerDB } = await import('@/database/server');
          const db = await getServerDB();
          emailService = await EmailService.createFromSystemConfig(db);
        } catch {
          emailService = new EmailService();
        }
        await emailService.sendMail({
          to: user.email,
          ...template,
        });
      },
    },
    onAPIError: {
      errorURL: '/auth-error',
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 2 * 60, // Cache duration in seconds
      },
      // Keep a DB-backed fallback when Redis secondary storage entries are unexpectedly missing.
      storeSessionInDatabase: true,
    },
    database: drizzleAdapter(serverDB, {
      provider: 'pg',
      // experimental joins feature needs schema to pass full relation
      schema,
    }),
    secondaryStorage: createSecondaryStorage(),
    /**
     * Database joins is useful when Better-Auth needs to fetch related data from multiple tables in a single query.
     * Endpoints like /get-session, /get-full-organization and many others benefit greatly from this feature,
     * seeing upwards of 2x to 3x performance improvements depending on database latency.
     * Ref: https://www.better-auth.com/docs/adapters/drizzle#joins-experimental
     */
    experimental: { joins: true },
    /**
     * Run user bootstrap for every newly created account (email, magic link, OAuth/social, etc.).
     * Using Better Auth database hooks ensures we catch social flows that bypass /sign-up/* routes.
     * Ref: https://www.better-auth.com/docs/reference/options#databasehooks
     */
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // 首个注册用户自动成为管理员。
            // better-auth 的 admin 插件对新增用户只写默认 'user',不提供首用户提升,
            // 因此在插入后判定:DB 中仅此一人时,将该行 role 更新为 'admin'。
            let isFirstUser = false;
            try {
              isFirstUser = (await serverDB.$count(schema.users)) === 1;
            } catch (e) {
              console.error('[auth] first-user admin check failed:', e);
            }
            if (isFirstUser && user.role !== 'admin') {
              try {
                await serverDB
                  .update(schema.users)
                  .set({ role: 'admin' })
                  .where(eq(schema.users.id, user.id));
                console.log(`[auth] First user ${user.email} promoted to admin.`);
              } catch (e) {
                console.error('[auth] Failed to promote first user to admin:', e);
              }
            }
            const userService = new UserService(serverDB);
            await userService.initUser({
              email: user.email,
              id: user.id,
              username: user.username as string | null,
              createdAt: user.createdAt,
              // TODO: if add phone plugin, we should fill phone here
            });
          },
        },
      },
    },
    user: {
      changeEmail: {
        enabled: true,
      },
      additionalFields: {
        username: {
          required: false,
          type: 'string',
        },
      },
      fields: {
        image: 'avatar',
        // NOTE: use drizzle filed instead of db field, so use fullName instead of full_name
        name: 'fullName',
      },
      modelName: 'users',
    },

    socialProviders: mergedSocialProviders,
    advanced: {
      database: {
        /**
         * Align Better Auth user IDs with our shared idGenerator for consistency.
         * Other models use the shared nanoid generator (12 chars) to keep IDs consistent project-wide.
         */
        generateId: ({ model }) => {
          // Better Auth passes the model name; handle both singular and plural for safety.
          if (model === 'user' || model === 'users') {
            // clerk id length is 32
            return idGenerator('user', 32 - 'user_'.length);
          }

          // Other models: use shared nanoid generator (12 chars) to keep consistency.
          return createNanoId(12)();
        },
      },
    },
    rateLimit: {
      customRules: {
        '/phone-number/send-otp': { max: 3, window: 60 },
        '/request-password-reset': { max: 3, window: 60 },
        '/send-verification-email': { max: 3, window: 60 },
      },
    },
    plugins: [
      ...customOptions.plugins,
      // 手机验证码登录(阿里云短信,凭据来自 admin 后台 DB 配置)。
      // signUpOnVerification 实现「首验即注册」:手机号不存在时校验通过即建号。
      ...(dynSmsCfg
        ? [
            phoneNumber({
              // 纯数字验证码,位数由 admin 配置(默认 6)
              allowedAttempts: 3,
              expiresIn: 300,
              otpLength: dynSmsCfg.codeLength || 6,
              // 仅中国大陆手机号(11 位,1 开头)
              phoneNumberValidator: (phone: string) => /^1[3-9]\d{9}$/.test(phone.trim()),
              async sendOTP({ phoneNumber: phone }) {
                if (!dynSmsCfg) throw new Error('短信登录未启用');
                if (!phone) throw new Error('手机号为空');
                await sendAliyunSms(dynSmsCfg, phone.trim(), {
                  code: generateNumericOtp(dynSmsCfg.codeLength || 6),
                }).catch((e) => {
                  console.error('[auth][sms] send failed:', e);
                  throw e;
                });
              },
              signUpOnVerification: {
                getTempEmail: (phone) => `${phone}@phone.user`,
                getTempName: (phone) => `用户${phone.slice(-4)}`,
              },
            }),
          ]
        : []),
      emailWhitelist(),
      expo(),
      admin(),
      // Email OTP plugin for mobile verification
      emailOTP({
        expiresIn: OTP_EXPIRES_IN,
        otpLength: 6,
        allowedAttempts: 3,
        // Don't automatically send OTP on sign up - let mobile client manually trigger it
        sendVerificationOnSignUp: false,
        async sendVerificationOTP({ email, otp }) {
          const emailService = new EmailService();

          // For all OTP types, use the same template
          // userName is optional and will be null since we don't have user context here
          const template = getVerificationOTPEmailTemplate({
            expiresInSeconds: OTP_EXPIRES_IN,
            otp,
            userName: null,
          });

          await emailService.sendMail({
            to: email,
            ...template,
          });
        },
      }),
      passkey({
        rpName: 'ChatX',
        // Extract rpID from auth URL (e.g., 'lobehub.com' from 'https://lobehub.com')
        // Returns undefined if AUTH_URL is not set (e.g., in e2e tests)
        rpID: getPasskeyRpID(),
        // Support multiple origins: web + Android APK key hashes
        // Android origin format: android:apk-key-hash:<base64url-sha256-fingerprint>
        // Returns undefined if AUTH_URL is not set (e.g., in e2e tests)
        origin: getPasskeyOrigins(),
      }),
      ...(genericOAuthProviders.length > 0
        ? [
            genericOAuth({
              config: mergedGenericProviders,
            }),
          ]
        : []),
      ...(enableMagicLink
        ? [
            magicLink({
              expiresIn: MAGIC_LINK_EXPIRES_IN,
              sendMagicLink: async ({ email, url }) => {
                const template = getMagicLinkEmailTemplate({
                  expiresInSeconds: MAGIC_LINK_EXPIRES_IN,
                  url,
                });

                const emailService = new EmailService();
                await emailService.sendMail({
                  to: email,
                  ...template,
                });
              },
            }),
          ]
        : []),
    ],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}
