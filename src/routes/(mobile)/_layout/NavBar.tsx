'use client';

import { Icon } from '@lobehub/ui';
import { type TabBarProps } from '@lobehub/ui/mobile';
import { TabBar } from '@lobehub/ui/mobile';
import { createStaticStyles } from 'antd-style';
import { ImagePlus, MessageSquare, User } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MOBILE_TABBAR_HEIGHT } from '@/const/layoutTokens';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveTabKey } from '@/hooks/useActiveTabKey';
import { SidebarTabKey } from '@/store/global/initialState';

const styles = createStaticStyles(({ css, cssVar }) => ({
  active: css`
    svg {
      fill: color-mix(in srgb, ${cssVar.colorPrimary} 33%, transparent);
    }
  `,
  container: css`
    position: fixed;
    z-index: 100;
    inset-block-end: 0;
    inset-inline: 0;
  `,
}));

const NavBar = memo(() => {
  const { t } = useTranslation(['common', 'electron']);
  const activeKey = useActiveTabKey();
  const navigate = useWorkspaceAwareNavigate();

  // 移动端主导航:对话 / 创作 / 我的。
  // 生图与生视频同属"创作"(进入 /image 后由页面内模式切换器切换到 /video)。
  const items: TabBarProps['items'] = useMemo(
    () =>
      [
        {
          icon: (active: boolean) => (
            <Icon className={active ? styles.active : undefined} icon={MessageSquare} />
          ),
          key: SidebarTabKey.Chat,
          onClick: () => {
            navigate('/');
          },
          title: t('tab.chat'),
        },
        {
          icon: (active: boolean) => (
            <Icon className={active ? styles.active : undefined} icon={ImagePlus} />
          ),
          key: SidebarTabKey.Image,
          onClick: () => {
            navigate('/image', { escape: true });
          },
          title: t('navigation.create', { ns: 'electron' }),
        },
        {
          icon: (active: boolean) => (
            <Icon className={active ? styles.active : undefined} icon={User} />
          ),
          key: SidebarTabKey.Me,
          onClick: () => {
            navigate('/me', { escape: true });
          },
          title: t('tab.me'),
        },
      ].filter(Boolean) as TabBarProps['items'],
    [t],
  );

  return (
    <TabBar
      activeKey={activeKey}
      className={styles.container}
      height={MOBILE_TABBAR_HEIGHT}
      items={items}
    />
  );
});

NavBar.displayName = 'NavBar';

export default NavBar;
