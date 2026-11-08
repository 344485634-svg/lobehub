import { TRPCClientError } from '@trpc/client';
import { describe, expect, it, vi } from 'vitest';

import { notification } from '@/components/AntdStaticMethods';

import { handleSubscriptionRequiredError } from './handleSubscriptionRequiredError';

vi.mock('@/components/AntdStaticMethods', () => ({
  notification: { warning: vi.fn(), destroy: vi.fn() },
}));

vi.mock('@/features/Workspace/stableWorkspaceAwareNavigate', () => ({
  stableWorkspaceAwareNavigate: vi.fn(),
}));

const forbiddenError = (message: string) =>
  Object.assign(new TRPCClientError(message), { data: { code: 'FORBIDDEN' } });

describe('handleSubscriptionRequiredError', () => {
  it('detects insufficient credits and shows a recharge CTA', () => {
    vi.mocked(notification.warning).mockClear();
    const error = forbiddenError('积分不足：本次需 500 积分，剩余 424.11 积分');

    expect(handleSubscriptionRequiredError(error)).toBe(true);
    expect(notification.warning).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '积分不足，无法生成',
        description: '积分不足：本次需 500 积分，剩余 424.11 积分',
      }),
    );
  });

  it('detects subscription-required messages', () => {
    const error = forbiddenError('此模型需订阅套餐后使用');

    expect(handleSubscriptionRequiredError(error)).toBe(true);
    expect(notification.warning).toHaveBeenCalledWith(
      expect.objectContaining({ message: '无法使用此模型' }),
    );
  });

  it('returns false for other FORBIDDEN errors', () => {
    expect(handleSubscriptionRequiredError(forbiddenError('no permission'))).toBe(false);
  });

  it('returns false for non-TRPC errors', () => {
    expect(handleSubscriptionRequiredError(new Error('boom'))).toBe(false);
  });
});
