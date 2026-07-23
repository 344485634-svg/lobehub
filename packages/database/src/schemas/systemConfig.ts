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
} as const;

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
  /** 收钱吧应用 app_id */
  appId: string;
  /** 收钱吧 vendor_sn */
  vendorSn: string;
  /** 收钱吧 vendor_key（敏感） */
  vendorKey?: string;
  hasVendorKey?: boolean;
  /** 终端号 terminal_sn */
  terminalSn: string;
  /** 终端密钥 terminal_key（敏感） */
  terminalKey?: string;
  hasTerminalKey?: boolean;
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
