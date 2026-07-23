import { emailEnv } from '@/envs/email';

import { type EmailPayload, type EmailResponse, type EmailServiceImpl } from './impls';
import { createEmailServiceImpl, EmailImplType } from './impls';
import { NodemailerImpl } from './impls/nodemailer';
import { type NodemailerConfig } from './impls/nodemailer/type';

/**
 * Email service class
 * Prefer admin-managed system_configs SMTP when present.
 */
export class EmailService {
  private emailImpl: EmailServiceImpl;

  constructor(implType?: EmailImplType, nodemailerConfig?: NodemailerConfig, fromDefault?: string) {
    if (nodemailerConfig) {
      this.emailImpl = new NodemailerImpl(nodemailerConfig, fromDefault);
      return;
    }

    const envImplType =
      typeof window === 'undefined'
        ? (emailEnv.EMAIL_SERVICE_PROVIDER as EmailImplType | undefined)
        : undefined;
    const resolvedImplType = implType ?? envImplType ?? EmailImplType.Nodemailer;

    this.emailImpl = createEmailServiceImpl(resolvedImplType);
  }

  /**
   * Build EmailService from admin system_configs, falling back to env vars.
   */
  static async createFromSystemConfig(db: any): Promise<EmailService> {
    try {
      const { SystemConfigModel } = await import('@/database/models/systemConfig');
      const { KeyVaultsGateKeeper } = await import('@/server/modules/KeyVaultsEncrypt');
      const model = new SystemConfigModel(db);
      const cfg = await model.getEmailConfig();

      if (cfg?.enabled && cfg.host && cfg.user && cfg.pass) {
        const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
        const { plaintext, wasAuthentic } = await gateKeeper.decrypt(cfg.pass);
        if (!wasAuthentic) {
          throw new Error('Failed to decrypt SMTP password. Check KEY_VAULTS_SECRET.');
        }

        return new EmailService(
          EmailImplType.Nodemailer,
          {
            auth: { pass: plaintext, user: cfg.user },
            host: cfg.host,
            port: cfg.port || 465,
            secure: cfg.secure ?? true,
          },
          cfg.from || cfg.user,
        );
      }
    } catch (error) {
      console.warn('[Email] Failed to load system email config, fallback to env:', error);
    }

    return new EmailService();
  }

  async sendMail(payload: EmailPayload): Promise<EmailResponse> {
    return this.emailImpl.sendMail(payload);
  }

  async verify(): Promise<boolean> {
    if ('verify' in this.emailImpl && typeof this.emailImpl.verify === 'function') {
      return this.emailImpl.verify();
    }
    return true;
  }
}

export type { EmailPayload, EmailResponse } from './impls';
export { EmailImplType } from './impls';
