export const CONTENT_POLICY_ERROR_MESSAGE =
  'Content policy check failed. Revise your prompt and try again.';

/**
 * 火山方舟(Seedance 系视频/图像模型)对含真人肖像的输入图有肖像权保护策略:
 * 未开通"真人内容"相关授权的账号,提交疑似真人图片会被 400 拒绝,错误码为
 * `InputImageSensitiveContentDetected.PrivacyInformation`(message 含
 * "may contain real person")。网关(newapi 系)会把它层层 JSON 转义后包成 500,
 * 所以检测必须做深层字符串扫描,不能只看顶层 code/message。
 */
export const REAL_PERSON_PORTRAIT_CONTENT_MESSAGE = [
  'The input image was rejected because it may contain a real person (portrait-rights protection).',
  'To generate videos from real-person photos, enable real-person content authorization for your provider account',
  '(e.g. Volcengine Ark real-person approval), or use an image without identifiable real people.',
].join(' ');

interface ContentPolicyErrorLike {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  name?: unknown;
  stack?: unknown;
  type?: unknown;
}

/** Error 实例的可枚举自有属性(JSON.stringify 覆盖不到 message)。 */
const collectErrorParts = (error: Error): Record<string, unknown> => ({
  ...(error as unknown as Record<string, unknown>),
  message: error.message,
  name: error.name,
});

/** 已知的内容审核错误码(顶层精确匹配用)。 */
const CONTENT_POLICY_ERROR_CODES = new Set(['content_policy_violation', 'moderation_blocked']);
/** 前缀形态的审核错误码(如 InputTextSensitiveContentDetected、其 .PrivacyInformation 变体)。 */
const CONTENT_POLICY_ERROR_CODE_PREFIXES = ['InputTextSensitiveContentDetected'] as const;

/** 在错误对象任意一层找审核错误码(顶层 code / 嵌套 error.code / type)。 */
const findKnownPolicyCode = (error: unknown, depth = 0): boolean => {
  if (depth > 6) return false;
  if (error instanceof Error) error = collectErrorParts(error);
  if (!isRecord(error)) return false;

  for (const key of ['code', 'type'] as const) {
    const value: unknown = error[key];
    if (typeof value === 'string') {
      if (CONTENT_POLICY_ERROR_CODES.has(value)) return true;
      if (CONTENT_POLICY_ERROR_CODE_PREFIXES.some((prefix) => value.startsWith(prefix)))
        return true;
    }
  }
  return isRecord(error.error) && findKnownPolicyCode(error.error, depth + 1);
};

/** 触发真人肖像保护的特征串(大小写不敏感,深层扫描用)。 */
const REAL_PERSON_MARKERS = [
  'inputimagesensitivecontentdetected',
  'may contain real person',
] as const;

/** 已知的内容审核文案特征(大小写不敏感,深层扫描用)。 */
const CONTENT_POLICY_TEXT_MARKERS = [
  'content policy',
  'safety system',
  'sensitive information',
] as const;

const isRecord = (value: unknown): value is ContentPolicyErrorLike =>
  Boolean(value) && typeof value === 'object';

const isError = (value: unknown): value is Error =>
  value instanceof Error ||
  (isRecord(value) && typeof value.message === 'string' && !Array.isArray(value));

/**
 * 深层序列化扫描错误对象。
 *
 * 两类坑都要避开:
 * 1. 网关转发的上游审核错误往往是「JSON 字符串塞在另一层 JSON 的 message 字段里」,
 *    结构化遍历会漏掉 → 对普通对象直接 JSON.stringify 后做字符串匹配;
 * 2. Error 实例的 message 是不可枚举属性,JSON.stringify 出来是 `{}` →
 *    先摊平成普通对象再序列化,序列化失败(循环引用等)再退化为逐字段收集。
 */
const serializeDeep = (error: unknown): string => {
  const seen = new WeakSet<object>();
  const safeJson = (value: unknown): string => {
    try {
      return (
        JSON.stringify(value, (_key, val) => {
          if (val instanceof Error) return collectErrorParts(val);
          if (isRecord(val)) {
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
          }
          if (typeof val === 'bigint') return val.toString();
          return val;
        }) ?? ''
      );
    } catch {
      return '';
    }
  };

  const normalized = isError(error) ? collectErrorParts(error) : error;
  let text = safeJson(normalized);

  if (!text) {
    // 兜底:逐字段收集字符串(message、code、name、嵌套 error 链)。
    const parts: string[] = [];
    const walk = (value: unknown, depth: number) => {
      if (depth > 6) return;
      if (isError(value)) value = collectErrorParts(value);
      if (!isRecord(value)) return;
      for (const [key, val] of Object.entries(value)) {
        if (typeof val === 'string' || typeof val === 'number') parts.push(`${key}:${val}`);
        else if (isRecord(val) || isError(val)) walk(val, depth + 1);
      }
    };
    walk(error, 0);
    text = parts.join(' ');
  }

  return text.toLowerCase();
};

export interface GetProviderContentPolicyErrorMessageParams {
  error: unknown;
  provider: string;
  trigger?: string;
  userId?: string;
}

export const getProviderContentPolicyErrorMessage = async ({
  error,
}: GetProviderContentPolicyErrorMessageParams): Promise<string | undefined> => {
  if (!error) return undefined;

  const text = serializeDeep(error);

  // 真人肖像保护优先级最高,给出针对性指引,而不是笼统的"改提示词"。
  if (REAL_PERSON_MARKERS.some((marker) => text.includes(marker))) {
    return REAL_PERSON_PORTRAIT_CONTENT_MESSAGE;
  }

  // 任意层级的审核错误码,或任意深度的审核文案特征 → 通用内容审核提示。
  if (findKnownPolicyCode(error) || CONTENT_POLICY_TEXT_MARKERS.some((m) => text.includes(m))) {
    return CONTENT_POLICY_ERROR_MESSAGE;
  }

  return undefined;
};
