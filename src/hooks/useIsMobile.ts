import { useResponsive } from 'antd-style';
import { useMemo } from 'react';

export const useIsMobile = (): boolean => {
  const { mobile } = useResponsive();

  // __MOBILE__ 是构建时常量(mobile SPA 构建恒为 true):手机横屏/平板宽度
  // 超过 xs 断点(576px)时 useResponsive 的 mobile 会失效,底部导航栏等
  // 关键 UI 会消失。以构建目标为准、视口断点为辅(桌面窗口缩窄到手机
  // 宽度时仍按移动布局)。
  return useMemo(() => __MOBILE__ || !!mobile, [mobile]);
};
