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
  email: 'email.smtp',
  paymentShouqianba: 'payment.shouqianba',
  referral: 'referral.policy',
  storageImgbb: 'storage.imgbb',
} as const;

/** imgbb 图床配置:视频参考图等非公网素材经此转公网 URL 提交给网关 */
export type StorageImgbbConfig = {
  enabled: boolean;
  /** imgbb API key (https://api.imgbb.com/); stored encrypted */
  apiKey?: string;
  /** Whether an API key is already saved (response field only) */
  hasApiKey?: boolean;
  /** Upload expiration in seconds; 0 = never expire (default) */
  expiration?: number;
};

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
