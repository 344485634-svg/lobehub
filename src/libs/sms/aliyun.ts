import crypto from 'node:crypto';

import type { AuthSmsConfig } from '@/database/schemas/systemConfig';

/**
 * 阿里云短信( dysmsapi )纯 HTTP 实现 —— 不引入 @alicloud SDK,
 * 按官方 RPC 签名规范自行签名,避免给镜像增加依赖与体积。
 * 凭据全部来自 admin 后台 DB 配置(auth.sms),不依赖环境变量。
 * 文档: https://help.aliyun.com/zh/isms/developer-reference/api-dysmsapi-2017-05-25-sendSms
 */

const SMS_ENDPOINT = 'https://dysmsapi.aliyuncs.com';
const API_VERSION = '2017-05-25';

/** RFC3986 percent-encode (阿里云签名要求, + → %20, * → %2A, ~ 不转义) */
const encodeRpc = (input: string) =>
  encodeURIComponent(input)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '2A'.replace('2A', '%2A'))
    .replace(/%7E/g, '~');

const hmacSha1 = (key: string, data: string) =>
  crypto.createHmac('sha1', key).update(data, 'utf8').digest('base64');

export type SendSmsResult = {
  /** 阿里云回执流水号 */
  bizId: string;
  code: string;
  message?: string;
};

/**
 * 发送一条阿里云短信。调用方保证配置已完整。
 * @param config   DB 中的短信配置(secret 为解密后的明文)
 * @param phone    接收手机号(中国大陆,不带 +86)
 * @param templateParams  模板变量,如 { code: '123456' }
 */
export const sendAliyunSms = async (
  config: AuthSmsConfig,
  phone: string,
  templateParams: Record<string, string>,
): Promise<SendSmsResult> => {
  const secret = config.accessKeySecret;
  if (!secret) throw new Error('阿里云短信尚未配置 AccessKey Secret');

  const params: Record<string, string> = {
    AccessKeyId: config.accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    RegionId: 'cn-hangzhou',
    SignName: config.signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: config.templateCode,
    TemplateParam: JSON.stringify(templateParams),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: API_VERSION,
  };

  // 1. 排序并拼接 canonicalized query
  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys.map((k) => `${encodeRpc(k)}=${encodeRpc(params[k])}`).join('&');

  // 2. 构造待签名字符串
  const stringToSign = `POST&${encodeRpc('/')}&${encodeRpc(canonicalQuery)}`;

  // 3. HMAC-SHA1( secret + '&' )
  const signature = encodeRpc(hmacSha1(`${secret}&`, stringToSign));

  const response = await fetch(`${SMS_ENDPOINT}/?Signature=${signature}&${canonicalQuery}`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });

  const data = (await response.json()) as {
    BizId?: string;
    Code: string;
    Message?: string;
  };

  if (data.Code !== 'OK') {
    throw new Error(`阿里云短信发送失败(${data.Code}):${data.Message ?? '未知错误'}`);
  }

  return { bizId: data.BizId ?? '', code: data.Code, message: data.Message };
};

/** 生成纯数字验证码,位数由配置决定(默认 6) */
export const generateNumericOtp = (length: number): string => {
  const len = Math.max(4, Math.min(8, length || 6));
  // crypto 随机,首位允许 0(保持位数),范围 [0, 10^len)
  let num = crypto.randomInt(0, 10 ** len);
  return num.toString().padStart(len, '0');
};
