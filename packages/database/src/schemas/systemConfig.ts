import { jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';

/**
 * Global system configuration key-value store (admin managed).
 * Secrets should be encrypted before writing to `value`.
 */
export const systemConfigs = pgTable('system_configs', {
  key: varchar('key', { length: 128 }).primaryKey(),
  // Free-form JSON payload. Sensitive fields may be ciphertext strings.
  value: jsonb('value').$type<Record<string, unknown>>().notNull().default({}),
  description: text('description'),
  updatedBy: text('updated_by'),
  ...timestamps,
});

export type SystemConfigItem = typeof systemConfigs.$inferSelect;
export type NewSystemConfig = typeof systemConfigs.$inferInsert;

export const SYSTEM_CONFIG_KEYS = {
  authSms: 'auth.sms',
  authWechat: 'auth.wechat',
  email: 'email.smtp',
  paymentShouqianba: 'payment.shouqianba',
  referral: 'referral.policy',
} as const;

/** Level-1 referral rebate policy */
export type ReferralPolicyConfig = {
  enabled: boolean;
  /**
   * Tiered rebate rates by invitee spend amount (CNY).
   * First matching tier from high minAmount wins.
   * rate is fraction, e.g. 0.1 = 10% of spend converted to credits at 1 CNY = 100 credits,
   * OR rate is "credits per CNY spend" — we use: rewardCredits = floor(spendCNY * rate * 100)
   * where rate is rebate ratio of money, then money→credits at 1:100.
   *
   * Example: spend 99 CNY, rate 0.1 → reward = floor(99 * 0.1 * 100) = 990 credits
   */
  tiers: Array<{ minAmount: number; rate: number; label?: string }>;
  /** Default rate when no tier matches */
  defaultRate: number;
  /** Credits granted to inviter when invitee completes registration (0 = disabled) */
  registrationCredits?: number;
  /** Credits granted to new invitee on registration (0 = disabled) */
  inviteeRegistrationCredits?: number;
};

export type EmailSmtpConfig = {
  enabled: boolean;
  /** Require email verification on signup/login when true */
  requireVerification: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** Plaintext only when writing; stored encrypted */
  pass?: string;
  /** Whether a password is already saved (response field only) */
  hasPass?: boolean;
  from: string;
  provider: 'nodemailer' | 'resend';
  resendApiKey?: string;
  hasResendApiKey?: boolean;
};

export type ShouqianbaConfig = {
  enabled: boolean;
  /** 收钱吧应用 app_id（开发者序列号对应的 app_id） */
  appId: string;
  /** 开发者序列号 vendor_sn */
  vendorSn: string;
  /** 开发者密钥 vendor_key（敏感） */
  vendorKey?: string;
  hasVendorKey?: boolean;
  /** 门店设备激活码（用于激活终端，激活后无需手动填写 terminalSn/Key） */
  activationCode?: string;
  /** 终端号 terminal_sn（由激活接口自动写入） */
  terminalSn: string;
  /** 终端密钥 terminal_key（由激活接口自动写入，敏感；每自然日过期，交易前需签到刷新） */
  terminalKey?: string;
  hasTerminalKey?: boolean;
  /** 设备唯一身份ID（激活时生成并固定，签到接口需要复用） */
  deviceId?: string;
  /** API 环境 */
  env: 'sandbox' | 'production';
  /** 支付回调通知 URL */
  notifyUrl: string;
  /** 前台回跳 URL */
  returnUrl: string;
  /** 支持的支付方式 */
  payways: Array<'alipay' | 'wechat' | 'unionpay'>;
  remark?: string;
};

/** 微信登录配置(公众号服务号网页授权 + 开放平台扫码) */
export type AuthWechatConfig = {
  enabled: boolean;
  /**
   * 应用类型:
   * - 'mp'   公众号服务号网页授权(手机微信内 H5 授权,PC 端带参二维码引导)
   * - 'open' 微信开放平台网站应用扫码(需要开放平台企业认证)
   */
  appType: 'mp' | 'open';
  /** 公众号 AppID / 开放平台 AppID */
  appId: string;
  /** 公众号 AppSecret / 开放平台 AppSecret(敏感,入库加密) */
  appSecret?: string;
  /** 是否已配置 secret(响应字段) */
  hasAppSecret?: boolean;
  /** 网页授权回调域名,如 chat.xingu-ai.com(不带协议) */
  callbackDomain?: string;
};

/** 阿里云短信登录配置 */
export type AuthSmsConfig = {
  enabled: boolean;
  /** 阿里云 AccessKey ID(建议使用仅短信权限的 RAM 子账号) */
  accessKeyId: string;
  /** AccessKey Secret(敏感,入库加密) */
  accessKeySecret?: string;
  /** 是否已配置 secret(响应字段) */
  hasAccessKeySecret?: boolean;
  /** 短信签名,如「芯谷智能」 */
  signName: string;
  /** 验证码模板 CODE,如 SMS-XXXXXXXX */
  templateCode: string;
  /** 验证码位数(纯数字) */
  codeLength: number;
  /** 同一手机号每日发送上限 */
  dailyLimitPerPhone: number;
  /** 同一手机号两次发送最小间隔(秒) */
  intervalSeconds: number;
};
