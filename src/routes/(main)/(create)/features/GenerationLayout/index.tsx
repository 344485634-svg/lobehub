'use client';

import { Flexbox } from '@lobehub/ui';
import { cx } from 'antd-style';
import type { FC, ReactNode } from 'react';
import { Outlet } from 'react-router';

import { useIsMobile } from '@/hooks/useIsMobile';

import { styles } from './style';

export interface GenerationLayoutProps {
  /** Optional extra content (e.g. RegisterHotkeys for image) */
  extra?: ReactNode;
  /** Sidebar wrapped in a NavPanelPortal by the caller (namespace-specific). */
  sidebar: ReactNode;
}

const GenerationLayout: FC<GenerationLayoutProps> = ({ extra, sidebar }) => {
  const isMobile = useIsMobile();

  return (
    <>
      {sidebar}
      <Flexbox
        className={cx(styles.mainContainer, isMobile && styles.mainContainerMobile)}
        flex={1}
        height={'100%'}
        // 外层 ant-app(antd App)是 align-items:center 的 column flex——子元素默认按
        // 内容宽居中而非拉伸,移动端会露出两侧灰边。显式 stretch 保证占满视口宽。
        style={{ alignSelf: 'stretch', width: '100%' }}
      >
        <Outlet />
      </Flexbox>
      {extra}
    </>
  );
};

export default GenerationLayout;
