import { TRPCClientError } from '@trpc/client';
import { Button } from 'antd';
import { createElement } from 'react';

import { notification } from '@/components/AntdStaticMethods';
import { stableWorkspaceAwareNavigate } from '@/features/Workspace/stableWorkspaceAwareNavigate';

const SUBSCRIPTION_REQUIRED_MESSAGES = [
  '此模型需订阅套餐后使用',
  '此模型为套餐专属',
  '当前套餐不包含此模型',
  '积分不足：当前模型需订阅套餐',
  '积分不足：当前图片模型需订阅套餐',
  '积分不足：当前视频模型需订阅套餐',
];

/**
 * Detects FORBIDDEN errors thrown by checkModelAccess and shows a notification
 * with a "查看订阅套餐" CTA button instead of a bare error message.
 *
 * Returns true if this was a subscription error (caller can skip re-throw / default handling).
 */
export const handleSubscriptionRequiredError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;
  if (error.data?.code !== 'FORBIDDEN') return false;
  if (!SUBSCRIPTION_REQUIRED_MESSAGES.some((msg) => error.message.includes(msg))) return false;

  const key = `sub-required-${Date.now()}`;

  notification.warning({
    btn: createElement(
      Button,
      {
        size: 'small',
        type: 'primary',
        onClick: () => {
          notification.destroy(key);
          stableWorkspaceAwareNavigate('/settings/plans');
        },
      },
      '查看订阅套餐',
    ),
    description: error.message,
    duration: 8,
    key,
    message: '无法使用此模型',
  });

  return true;
};
