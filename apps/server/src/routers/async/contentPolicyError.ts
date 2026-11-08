import {
  CONTENT_POLICY_ERROR_MESSAGE,
  getProviderContentPolicyErrorMessage,
  REAL_PERSON_PORTRAIT_CONTENT_MESSAGE,
} from '@/business/server/getProviderContentPolicyErrorMessage';

export { CONTENT_POLICY_ERROR_MESSAGE };

const getErrorCode = (error: any) => error?.code || error?.error?.code;

/**
 * 同步版兜底:供 imageError.ts 等同步分类链路复用。
 * 只做顶层 code/文案匹配;完整深层检测(网关包裹的真人肖像错误等)走异步版
 * `getProviderContentPolicyErrorMessage`。
 */
export const getContentPolicyErrorMessage = (error: any) => {
  const errorCode = getErrorCode(error);
  const errorMessage = error?.message || error?.error?.message || '';

  if (
    (typeof errorCode === 'string' &&
      (errorCode === 'InputTextSensitiveContentDetected' ||
        errorCode === 'content_policy_violation' ||
        errorCode === 'moderation_blocked' ||
        errorCode.startsWith('InputImageSensitiveContentDetected'))) ||
    errorMessage.includes('content policy') ||
    errorMessage.includes('safety system') ||
    errorMessage.includes('sensitive information') ||
    errorMessage.includes('may contain real person')
  ) {
    return CONTENT_POLICY_ERROR_MESSAGE;
  }
};

export { getProviderContentPolicyErrorMessage, REAL_PERSON_PORTRAIT_CONTENT_MESSAGE };
