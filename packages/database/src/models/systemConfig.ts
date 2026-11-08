import { eq } from 'drizzle-orm';

import {
  type AuthSmsConfig,
  type AuthWechatConfig,
  type EmailSmtpConfig,
  type ShouqianbaConfig,
  type StorageImageHostConfig,
  SYSTEM_CONFIG_KEYS,
  systemConfigs,
} from '../schemas/systemConfig';
import type { LobeChatDatabase } from '../type';

export class SystemConfigModel {
  constructor(private db: LobeChatDatabase) {}

  async get<T extends Record<string, unknown> = Record<string, unknown>>(
    key: string,
  ): Promise<T | undefined> {
    const row = await this.db.query.systemConfigs.findFirst({
      where: eq(systemConfigs.key, key),
    });
    return row?.value as T | undefined;
  }

  async set(
    key: string,
    value: Record<string, unknown>,
    opts?: { description?: string; updatedBy?: string },
  ) {
    const [row] = await this.db
      .insert(systemConfigs)
      .values({
        description: opts?.description,
        key,
        updatedAt: new Date(),
        updatedBy: opts?.updatedBy,
        value,
      })
      .onConflictDoUpdate({
        set: {
          description: opts?.description,
          updatedAt: new Date(),
          updatedBy: opts?.updatedBy,
          value,
        },
        target: systemConfigs.key,
      })
      .returning();
    return row;
  }

  async getEmailConfig(): Promise<EmailSmtpConfig | undefined> {
    return this.get<EmailSmtpConfig>(SYSTEM_CONFIG_KEYS.email);
  }

  async setEmailConfig(value: EmailSmtpConfig, updatedBy?: string) {
    return this.set(SYSTEM_CONFIG_KEYS.email, value as unknown as Record<string, unknown>, {
      description: 'SMTP / email service configuration',
      updatedBy,
    });
  }

  async getShouqianbaConfig(): Promise<ShouqianbaConfig | undefined> {
    return this.get<ShouqianbaConfig>(SYSTEM_CONFIG_KEYS.paymentShouqianba);
  }

  async setShouqianbaConfig(value: ShouqianbaConfig, updatedBy?: string) {
    return this.set(
      SYSTEM_CONFIG_KEYS.paymentShouqianba,
      value as unknown as Record<string, unknown>,
      {
        description: 'Shouqianba (收钱吧) payment configuration',
        updatedBy,
      },
    );
  }

  async getAuthWechatConfig(): Promise<AuthWechatConfig | undefined> {
    return this.get<AuthWechatConfig>(SYSTEM_CONFIG_KEYS.authWechat);
  }

  async setAuthWechatConfig(value: AuthWechatConfig, updatedBy?: string) {
    return this.set(
      SYSTEM_CONFIG_KEYS.authWechat,
      value as unknown as Record<string, unknown>,
      {
        description: 'WeChat login configuration (admin managed)',
        updatedBy,
      },
    );
  }

  async getAuthSmsConfig(): Promise<AuthSmsConfig | undefined> {
    return this.get<AuthSmsConfig>(SYSTEM_CONFIG_KEYS.authSms);
  }

  async setAuthSmsConfig(value: AuthSmsConfig, updatedBy?: string) {
    return this.set(
      SYSTEM_CONFIG_KEYS.authSms,
      value as unknown as Record<string, unknown>,
      {
        description: 'SMS (Aliyun) phone login configuration (admin managed)',
        updatedBy,
      },
    );
  }

  async getImageHostConfig(): Promise<StorageImageHostConfig | undefined> {
    return this.get<StorageImageHostConfig>(SYSTEM_CONFIG_KEYS.storageImgbb);
  }

  async setImageHostConfig(value: StorageImageHostConfig, updatedBy?: string) {
    return this.set(SYSTEM_CONFIG_KEYS.storageImgbb, value as unknown as Record<string, unknown>, {
      description: 'image-host configuration for public reference media',
      updatedBy,
    });
  }
}
