import { createHash, randomBytes } from 'node:crypto';

import type { ShouqianbaConfig } from '@/database/schemas/systemConfig';

export type ShouqianbaPrecreateInput = {
  amount: string; // yuan, e.g. "99.00"
  channel?: 'alipay' | 'wechat' | 'unionpay';
  notifyUrl: string;
  outTradeNo: string;
  returnUrl?: string;
  subject: string;
};

export type ShouqianbaPrecreateResult = {
  qrCode?: string;
  raw: Record<string, unknown>;
  tradeNo?: string;
  /** Redirect / WAP url if provided by gateway */
  payUrl?: string;
};

/**
 * 收钱吧 OpenAPI 适配层（预下单）。
 *
 * 说明：
 * - 真实签名字段以收钱吧开放平台文档为准；此处实现通用 MD5 签名风格：
 *   参数按 key 排序拼接 + body + key，再 MD5 大写。
 * - sandbox 在未配置完整密钥时，返回本地 mock 二维码内容，便于联调 UI。
 */
export class ShouqianbaClient {
  constructor(private cfg: ShouqianbaConfig) {}

  private endpoint() {
    // 生产 / 沙箱网关（可按实际文档调整）
    return this.cfg.env === 'production'
      ? 'https://vsi-api.shouqianba.com'
      : 'https://vsi-api.shouqianba.com';
  }

  private sign(params: Record<string, string>, body: string, key: string) {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const raw = `${sorted}&body=${body}&key=${key}`;
    return createHash('md5').update(raw, 'utf8').digest('hex').toUpperCase();
  }

  async precreate(input: ShouqianbaPrecreateInput): Promise<ShouqianbaPrecreateResult> {
    if (!this.cfg.enabled) {
      throw new Error('收钱吧支付未启用');
    }

    // 本地 mock：方便在未拿到正式密钥前打通前端支付页
    if (
      this.cfg.env === 'sandbox' &&
      (!this.cfg.vendorKey || !this.cfg.terminalKey || this.cfg.vendorKey.length < 8)
    ) {
      const mockTradeNo = `MOCK${Date.now()}`;
      return {
        payUrl: input.returnUrl
          ? `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}outTradeNo=${input.outTradeNo}&mock=1`
          : undefined,
        qrCode: `shouqianba://pay?out_trade_no=${input.outTradeNo}&amount=${input.amount}&mock=1`,
        raw: { mock: true, out_trade_no: input.outTradeNo },
        tradeNo: mockTradeNo,
      };
    }

    // 解密后的密钥应由调用方注入明文 cfg
    const vendorKey = this.cfg.vendorKey || '';
    const terminalKey = this.cfg.terminalKey || '';
    if (!vendorKey || !terminalKey) {
      throw new Error('收钱吧密钥未配置完整');
    }

    const bodyObj = {
      operator: 'system',
      payway: input.channel === 'wechat' ? '3' : input.channel === 'unionpay' ? '17' : '1',
      subject: input.subject,
      total_amount: Math.round(Number(input.amount) * 100), // 分
      client_sn: input.outTradeNo,
      notify_url: input.notifyUrl,
      return_url: input.returnUrl,
    };
    const body = JSON.stringify(bodyObj);

    const headers: Record<string, string> = {
      'Authorization':
        this.cfg.vendorSn +
        ' ' +
        this.sign(
          {
            terminal_sn: this.cfg.terminalSn,
          },
          body,
          terminalKey,
        ),
      'Content-Type': 'application/json',
    };

    // 常见预下单路径（收钱吧终端支付）
    const url = `${this.endpoint()}/upay/v2/precreate`;
    const res = await fetch(url, {
      body,
      headers: {
        ...headers,
        terminal_sn: this.cfg.terminalSn,
      },
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) {
      throw new Error(
        `收钱吧下单失败: HTTP ${res.status} ${typeof raw === 'object' ? JSON.stringify(raw) : ''}`,
      );
    }

    // 兼容不同响应结构
    const biz = raw?.biz_response || raw?.data || raw;
    const qrCode = biz?.qr_code || biz?.qr_code_image_url || biz?.qrcode;
    const payUrl = biz?.wap_pay_request || biz?.pay_url || biz?.code_url;
    const tradeNo = biz?.sn || biz?.trade_no || biz?.client_sn;

    if (!qrCode && !payUrl) {
      const msg = biz?.error_message || raw?.error_message || '未返回支付二维码';
      throw new Error(`收钱吧下单失败: ${msg}`);
    }

    return {
      payUrl,
      qrCode,
      raw,
      tradeNo,
    };
  }

  static generateOutTradeNo(prefix = 'LH') {
    return `${prefix}${Date.now()}${randomBytes(3).toString('hex')}`.slice(0, 32);
  }
}
