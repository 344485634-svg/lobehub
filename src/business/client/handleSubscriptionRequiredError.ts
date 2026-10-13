import { Button } from '@lobehub/ui/base-ui';
import { TRPCClientError } from '@trpc/client';
import { createElement } from 'react';

import { notification } from '@/components/AntdStaticMethods';
import { stableWorkspaceAwareNavigate } from '@/features/Workspace/stableWorkspaceAwareNavigate';

const SUBSCRIPTION_REQUIRED_MESSAGES = [
  '此模型需订阅套餐后使用',
  '当前套餐不包含此模型',
  '积分不足：当前模型需订阅套餐',
  '积分不足：当前图片模型需订阅套餐',
  '积分不足：当前视频模型需订阅套餐',
];

/**
 * 积分不足(生成前预扣费门槛)。服务端以 FORBIDDEN + "积分不足：本次需 N 积分"
 * 抛出,若无专门处理会被静默吞掉,用户会以为是个 bug。
 */
const INSUFFICIENT_CREDITS_PATTERN = '积分不足：本次需';

/**
 * Detects FORBIDDEN errors thrown by checkModelAccess / the precharge gate and
 * shows a notification with a CTA button instead of a bare error message.
 *
 * Returns true if this was a subscription / credit error (caller can skip
 * re-throw / default handling).
 */
export const handleSubscriptionRequiredError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;
  if (error.data?.code !== 'FORBIDDEN') return false;

  // 积分不足:引导去充值(而非订阅页)
  if (error.message.includes(INSUFFICIENT_CREDITS_PATTERN)) {
    const key = `insufficient-credits-${Date.now()}`;

    notification.warning({
      btn: createElement(
        Button,
        {
          size: 'small',
          type: 'primary',
          onClick: () => {
            notification.destroy(key);
            stableWorkspaceAwareNavigate('/settings/credits');
          },
        },
        '去充值',
      ),
      description: error.message,
      duration: 8,
      key,
      message: '积分不足，无法生成',
    });

    return true;
  }

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
