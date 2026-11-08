import { describe, expect, it } from 'vitest';

// 导入实现里的常量做断言:测试关注的是「识别正确 + 两条路径返回不同指引」,
// 文案本身随时可调,不必在测试里再抄一份导致双处维护漂移。
import {
  CONTENT_POLICY_ERROR_MESSAGE,
  getProviderContentPolicyErrorMessage,
  REAL_PERSON_PORTRAIT_CONTENT_MESSAGE,
} from './getProviderContentPolicyErrorMessage';

// 线上真实报错形态:网关把上游火山方舟 400 审核错误层层 JSON 转义后包成 500。
// 见 chat.xingu-ai.com seedance2.0 图生视频工单 (trace_id: 803b1bad-3256-4eaa-affc-34fa130dd634)。
const GATEWAY_WRAPPED_REAL_PERSON_ERROR = new Error(
  'Failed to submit video task: OpenAI-compatible video API error: 500 {"code":"fail_to_fetch_task","message":"{\\"error\\":{\\"message\\":\\"[trace_id: 803b1bad-3256-4eaa-affc-34fa130dd634] Request llm server Error: server error, status code: 400, err: {\\\\\\"error\\\\\\":{\\\\\\"code\\\\\\":\\\\\\"InputImageSensitiveContentDetected.PrivacyInformation\\\\\\",\\\\\\"message\\\\\\":\\\\\\"The request failed because the input image \'content[1]\' may contain real person. Request id: 0217941205635236baea902239f26d786b4cc818bae24a8f559bc\\\\\\",\\\\\\"param\\\\\\":\\\\\\"content[1]\\\\\\",\\\\\\"type\\\\\\":\\\\\\"BadRequest\\\\\\"}}\\",\\"type\\":\\"internal_error\\",\\"param\\":null,\\"code\\":\\"model_server_error\\",\\"trace_id\\":\\"803b1bad-3256-4eaa-affc-34fa130dd634\\"}}","data":null}',
);

describe('getProviderContentPolicyErrorMessage', () => {
  describe('real-person portrait detection (Volcengine InputImageSensitiveContentDetected)', () => {
    it('should detect real-person rejection wrapped in gateway error JSON', async () => {
      const message = await getProviderContentPolicyErrorMessage({
        error: GATEWAY_WRAPPED_REAL_PERSON_ERROR,
        provider: 'newapi',
        trigger: 'video',
      });

      expect(message).toBe(REAL_PERSON_PORTRAIT_CONTENT_MESSAGE);
    });

    it('should detect structured InputImageSensitiveContentDetected code', async () => {
      const message = await getProviderContentPolicyErrorMessage({
        error: {
          error: {
            code: 'InputImageSensitiveContentDetected.PrivacyInformation',
            message: "The input image 'content[1]' may contain real person.",
            type: 'BadRequest',
          },
        },
        provider: 'volcengine',
      });

      expect(message).toBe(REAL_PERSON_PORTRAIT_CONTENT_MESSAGE);
    });

    it('should detect "may contain real person" text without the code', async () => {
      const message = await getProviderContentPolicyErrorMessage({
        error: new Error(
          'Video generation failed: The request failed because the input image may contain real person.',
        ),
        provider: 'newapi',
      });

      expect(message).toBe(REAL_PERSON_PORTRAIT_CONTENT_MESSAGE);
    });

    it('should detect the marker nested multiple levels deep', async () => {
      const message = await getProviderContentPolicyErrorMessage({
        error: {
          error: {
            error: {
              message:
                'err: {"error":{"code":"InputImageSensitiveContentDetected","message":"input image may contain real person"}}',
            },
          },
        },
        provider: 'newapi',
      });

      expect(message).toBe(REAL_PERSON_PORTRAIT_CONTENT_MESSAGE);
    });
  });

  describe('generic content policy detection', () => {
    it('should detect known content policy codes', async () => {
      expect(
        await getProviderContentPolicyErrorMessage({
          error: { code: 'content_policy_violation' },
          provider: 'newapi',
        }),
      ).toBe(CONTENT_POLICY_ERROR_MESSAGE);

      expect(
        await getProviderContentPolicyErrorMessage({
          error: { error: { code: 'moderation_blocked' } },
          provider: 'newapi',
        }),
      ).toBe(CONTENT_POLICY_ERROR_MESSAGE);

      expect(
        await getProviderContentPolicyErrorMessage({
          error: { code: 'InputTextSensitiveContentDetected' },
          provider: 'newapi',
        }),
      ).toBe(CONTENT_POLICY_ERROR_MESSAGE);
    });

    it('should detect content policy message text', async () => {
      expect(
        await getProviderContentPolicyErrorMessage({
          error: new Error('Your request was rejected by the safety system.'),
          provider: 'newapi',
        }),
      ).toBe(CONTENT_POLICY_ERROR_MESSAGE);
    });
  });

  describe('non-policy errors', () => {
    it('should return undefined for unrelated provider errors', async () => {
      expect(
        await getProviderContentPolicyErrorMessage({
          error: new Error('OpenAI-compatible video API error: 503 模型维护中'),
          provider: 'newapi',
        }),
      ).toBeUndefined();

      expect(
        await getProviderContentPolicyErrorMessage({
          error: { code: 'rate_limit_exceeded' },
          provider: 'newapi',
        }),
      ).toBeUndefined();
    });

    it('should return undefined for null/undefined errors', async () => {
      expect(
        await getProviderContentPolicyErrorMessage({ error: null, provider: 'newapi' }),
      ).toBeUndefined();
      expect(
        await getProviderContentPolicyErrorMessage({ error: undefined, provider: 'newapi' }),
      ).toBeUndefined();
    });
  });
});
