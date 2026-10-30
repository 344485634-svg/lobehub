import { type ActionIconProps, type FlexboxProps } from '@lobehub/ui';
import { ActionIcon, Flexbox, TooltipGroup } from '@lobehub/ui';
import { ArrowLeft } from 'lucide-react';
import { type CSSProperties, type ReactNode } from 'react';
import { memo } from 'react';
import { useNavigate } from 'react-router';

import ToggleLeftPanelButton, { isMacDesktop } from '@/features/NavPanel/ToggleLeftPanelButton';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

export interface NavHeaderProps extends Omit<FlexboxProps, 'children'> {
  children?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  /**
   * 移动端是否显示返回按钮(默认显示)。层级深的页面(如生图生视频)
   * 没有左侧主导航,返回是唯一退路;平级页面可显式关闭。
   */
  showMobileBack?: boolean;
  showTogglePanelButton?: boolean;
  slotClassNames?: {
    center?: string;
    left?: string;
    right?: string;
  };
  styles?: {
    center?: CSSProperties;
    left?: CSSProperties;
    right?: CSSProperties;
  };
}

const MobileBackButton = memo(() => {
  const navigate = useNavigate();

  return (
    <ActionIcon
      icon={ArrowLeft}
      size={{ blockSize: 32, size: 18 }}
      onClick={() => {
        // 无历史(新标签直进)时兜底回首页
        if (window.history.state?.idx === 0) navigate('/');
        else navigate(-1);
      }}
    />
  );
});

MobileBackButton.displayName = 'MobileBackButton';

const NavHeader = memo<NavHeaderProps>(
  ({
    showMobileBack = true,
    showTogglePanelButton = true,
    style,
    children,
    left,
    right,
    slotClassNames,
    styles,
    ...rest
  }) => {
    const expand = useGlobalStore(systemStatusSelectors.showLeftPanel);
    const isMobile = useIsMobile();

    const noContent = !left && !right && !(isMobile && showMobileBack);

    // When empty, this header only rendered to host the collapse toggle. Hide it
    // when expanded, and also on macOS desktop where the toggle moved to the titlebar.
    if (noContent && !isMobile && (expand || isMacDesktop)) return;

    return (
      <Flexbox
        allowShrink
        horizontal
        align={'center'}
        flex={'none'}
        gap={4}
        height={44}
        justify={'space-between'}
        padding={8}
        style={style}
        {...rest}
      >
        <TooltipGroup>
          <Flexbox
            allowShrink
            horizontal
            align={'center'}
            className={slotClassNames?.left}
            gap={2}
            justify={'flex-start'}
            style={styles?.left}
          >
            {isMobile && showMobileBack && <MobileBackButton />}
            {showTogglePanelButton && !expand && <ToggleLeftPanelButton />}
            {left}
          </Flexbox>
          {children && (
            <Flexbox className={slotClassNames?.center} flex={1} style={styles?.center}>
              {children}
            </Flexbox>
          )}
          <Flexbox
            horizontal
            align={'center'}
            className={slotClassNames?.right}
            gap={2}
            justify={'flex-end'}
            style={styles?.right}
          >
            {right}
          </Flexbox>
        </TooltipGroup>
      </Flexbox>
    );
  },
);

export default NavHeader;
