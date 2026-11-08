import { TRPCClientError } from '@trpc/client';
// antd 静态通知挂载在应用根 Provider 之外的 portal,@lobehub/ui base-ui 组件
// 在其中缺少上下文会直接崩溃并拖垮整页;通知的 CTA 必须用 antd 原生 Button。
// eslint-disable-next-line no-restricted-imports
import { Button } from 'antd';
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

interface CtaNoticeConfig {
  buttonText: string;
  description: string;
  message: string;
  navigateTo: string;
}

/**
 * 带跳转按钮的警告通知。通知渲染失败绝不能拖垮页面(静态通知的 portal 在
 * Provider 树之外,任何渲染异常都会直冲根错误边界),因此这里兜底降级为纯文本。
 */
const showCtaNotification = ({ buttonText, description, message, navigateTo }: CtaNoticeConfig) => {
  const key = `cta-notice-${Date.now()}`;

  try {
    notification.warning({
      btn: createElement(
        Button,
        {
          size: 'small',
          type: 'primary',
          onClick: () => {
            notification.destroy(key);
            stableWorkspaceAwareNavigate(navigateTo);
          },
        },
        buttonText,
      ),
      description,
      duration: 8,
      key,
      message,
    });
  } catch (e) {
    console.error('[billing-notice] CTA notification failed, falling back to plain notice:', e);
    notification.warning({ description, duration: 8, key, message });
  }
};

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
    showCtaNotification({
      buttonText: '去充值',
      description: error.message,
      message: '积分不足，无法生成',
      navigateTo: '/settings/credits',
    });

    return true;
  }

  if (!SUBSCRIPTION_REQUIRED_MESSAGES.some((msg) => error.message.includes(msg))) return false;

  showCtaNotification({
    buttonText: '查看订阅套餐',
    description: error.message,
    message: '无法使用此模型',
    navigateTo: '/settings/plans',
  });

  return true;
};
