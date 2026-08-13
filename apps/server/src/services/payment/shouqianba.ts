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
  payUrl?: string;
};

export type ShouqianbaActivateResult = {
  terminalSn: string;
  terminalKey: string;
  deviceId: string;
};

/**
 * 签名规则：MD5(body + key) 全大写
 * Authorization 头格式："{sn} {sign}"
 */
function sign(body: string, key: string): string {
  const keyStr = String(key);
  return createHash('md5')
    .update(body + keyStr, 'utf8')
    .digest('hex')
    .toUpperCase();
}

export class ShouqianbaClient {
  constructor(private cfg: ShouqianbaConfig) {}

  private endpoint() {
    return 'https://vsi-api.shouqianba.com';
  }

  /**
   * 激活终端：用激活码换取 terminal_sn / terminal_key
   * POST /terminal/activate
   * Authorization: {vendor_sn} {MD5(body+vendor_key).upper}
   */
  async activate(activationCode: string): Promise<ShouqianbaActivateResult> {
    const vendorKey = this.cfg.vendorKey;
    if (!this.cfg.vendorSn || !vendorKey) {
      throw new Error('请先配置 vendorSn 和 vendorKey');
    }

    const deviceId = `lobe-${randomBytes(4).toString('hex')}`;
    const bodyObj = {
      app_id: this.cfg.appId,
      code: activationCode,
      device_id: deviceId,
      name: 'ChatLM Terminal',
      os_info: 'Linux',
      sdk_version: '2.0.0',
    };
    const body = JSON.stringify(bodyObj);
    const sig = sign(body, vendorKey);

    const res = await fetch(`${this.endpoint()}/terminal/activate`, {
      body,
      headers: {
        'Authorization': `${this.cfg.vendorSn} ${sig}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });

    const rawText = await res.text();
    let raw: Record<string, any>;
    try {
      raw = JSON.parse(rawText);
    } catch {
      throw new Error(`收钱吧激活失败: HTTP ${res.status}, 响应非 JSON: ${rawText.slice(0, 200)}`);
    }

    if (!res.ok || raw?.result_code !== '200') {
      const msg = raw?.error_message || raw?.error_code || `HTTP ${res.status}`;
      throw new Error(`收钱吧激活失败: ${msg}，完整响应: ${JSON.stringify(raw)}`);
    }

    const biz = raw?.biz_response || {};
    const terminalSn = biz?.terminal_sn;
    const terminalKey = biz?.terminal_key;
    if (!terminalSn || !terminalKey) {
      throw new Error(`收钱吧激活响应缺少 terminal_sn/terminal_key: ${JSON.stringify(raw)}`);
    }

    return { deviceId, terminalKey, terminalSn };
  }

  /**
   * 日签：每自然日首次交易前调用，获取当日有效 terminal_key
   * POST /terminal/checkin
   * Authorization: {terminal_sn} {MD5(body+terminal_key).upper}
   */
  async checkin(
    terminalSn: string,
    terminalKey: string,
    deviceId: string,
  ): Promise<{ terminalKey: string; terminalSn: string }> {
    const bodyObj = {
      device_id: deviceId,
      os_info: 'Linux',
      sdk_version: '2.0.0',
      terminal_sn: terminalSn,
    };
    const body = JSON.stringify(bodyObj);
    const sig = sign(body, terminalKey);

    const res = await fetch(`${this.endpoint()}/terminal/checkin`, {
      body,
      headers: {
        'Authorization': `${terminalSn} ${sig}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });

    const rawText = await res.text();
    let raw: Record<string, any>;
    try {
      raw = JSON.parse(rawText);
    } catch {
      throw new Error(
        `收钱吧 check-in 失败: HTTP ${res.status}, 响应非 JSON: ${rawText.slice(0, 200)}`,
      );
    }

    if (!res.ok || raw?.result_code !== '200') {
      const msg = raw?.error_message || raw?.error_code || `HTTP ${res.status}`;
      throw new Error(`收钱吧 check-in 失败: ${msg}`);
    }

    const biz = raw?.biz_response || {};
    const newTerminalSn = biz?.terminal_sn;
    const newTerminalKey = biz?.terminal_key;
    if (!newTerminalSn || !newTerminalKey) {
      throw new Error(`收钱吧 check-in 响应缺少字段: ${JSON.stringify(raw)}`);
    }

    return { terminalKey: newTerminalKey, terminalSn: newTerminalSn };
  }

  /**
   * 收钱吧 payway（以接口校验文案为准）：
   * 1=支付宝 3=微信 17=银联二维码
   * 没有真正的「一码双扫」聚合通道，需按用户选择的支付方式分别预下单。
   */
  private paywayOf(channel?: ShouqianbaPrecreateInput['channel']): string {
    if (channel === 'wechat') return '3';
    if (channel === 'unionpay') return '17';
    return '1'; // alipay
  }

  async precreate(input: ShouqianbaPrecreateInput): Promise<ShouqianbaPrecreateResult> {
    if (!this.cfg.enabled) {
      throw new Error('收钱吧支付未启用');
    }

    const terminalKey = this.cfg.terminalKey;
    if (!this.cfg.terminalSn || !terminalKey) {
      throw new Error('终端号/终端密钥未配置，请先完成激活');
    }

    const channel = input.channel || 'alipay';
    const bodyObj: Record<string, unknown> = {
      client_sn: input.outTradeNo,
      notify_url: input.notifyUrl,
      operator: 'system',
      payway: this.paywayOf(channel),
      subject: input.subject,
      terminal_sn: this.cfg.terminalSn,
      total_amount: String(Math.round(Number(input.amount) * 100)),
    };
    if (input.returnUrl) bodyObj.return_url = input.returnUrl;

    const body = JSON.stringify(bodyObj);
    const sig = sign(body, String(terminalKey));

    const res = await fetch(`${this.endpoint()}/upay/v2/precreate`, {
      body,
      headers: {
        'Authorization': `${this.cfg.terminalSn} ${sig}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, any>;
    const biz = raw?.biz_response || raw?.data || raw;

    // 收钱吧业务失败常仍返回 HTTP 200，需同时检查 result_code / biz_response
    const topOk = String(raw?.result_code || '') === '200' || res.ok;
    const bizOk =
      !biz?.result_code ||
      ['PRECREATE_SUCCESS', 'SUCCESS', '200'].includes(String(biz.result_code));

    if (!topOk || !bizOk || raw?.error_code) {
      const msg =
        biz?.error_message ||
        raw?.error_message ||
        raw?.error_code ||
        biz?.result_code ||
        `HTTP ${res.status}`;
      throw new Error(`收钱吧下单失败: ${msg}`);
    }

    const data = biz?.data || biz;
    const qrCode = data?.qr_code || data?.qrcode;
    const payUrl = data?.wap_pay_request || data?.pay_url || data?.code_url;
    const tradeNo = data?.sn || data?.trade_no || data?.client_sn;

    if (!qrCode && !payUrl) {
      const msg =
        biz?.error_message || biz?.result_code || raw?.error_message || '未返回支付二维码';
      throw new Error(`收钱吧下单失败: ${msg}`);
    }

    return { payUrl, qrCode, raw, tradeNo };
  }

  static generateOutTradeNo(prefix = 'LH') {
    return `${prefix}${Date.now()}${randomBytes(3).toString('hex')}`.slice(0, 32);
  }

  /**
   * 订单查询（主动轮询兜底，官方推荐「回调 + 主动轮询」并用）
   * POST /upay/v2/query
   * 返回收钱吧订单状态；未支付/不存在时抛错或返回 null。
   */
  async queryOrder(outTradeNo: string): Promise<{
    orderStatus?: string;
    raw: Record<string, unknown>;
    sn?: string;
    status?: string;
    tradeStatus?: string;
  } | null> {
    const terminalKey = this.cfg.terminalKey;
    if (!this.cfg.terminalSn || !terminalKey) {
      throw new Error('终端号/终端密钥未配置，请先完成激活');
    }

    const bodyObj: Record<string, unknown> = {
      client_sn: outTradeNo,
      terminal_sn: this.cfg.terminalSn,
    };
    const body = JSON.stringify(bodyObj);
    const sig = sign(body, String(terminalKey));

    const res = await fetch(`${this.endpoint()}/upay/v2/query`, {
      body,
      headers: {
        'Authorization': `${this.cfg.terminalSn} ${sig}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok || String(raw?.result_code || '') !== '200') {
      const msg = raw?.error_message || raw?.error_code || `HTTP ${res.status}`;
      throw new Error(`收钱吧订单查询失败: ${msg}`);
    }

    const biz = raw?.biz_response || raw?.data || raw;
    const data = biz?.data || biz;
    const status = data?.order_status || data?.status || biz?.order_status;
    const orderStatus = data?.order_status || biz?.order_status;
    const tradeStatus = data?.trade_status || biz?.trade_status;

    // 订单不存在（查询结果为空）时收钱吧可能返回特定 result_code
    if (String(raw?.result_code || '') !== '200') return null;

    return {
      orderStatus,
      raw,
      sn: data?.sn || data?.trade_no || undefined,
      status,
      tradeStatus,
    };
  }
}
