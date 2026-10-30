'use client';

import { Flexbox } from '@lobehub/ui';
import { AnimatePresence, m as motion } from 'motion/react';
import type { ComponentType, CSSProperties } from 'react';
import { memo } from 'react';
import { useMatch } from 'react-router';

import DragUploadZone from '@/components/DragUploadZone';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import WideScreenButton from '@/features/WideScreenContainer/WideScreenButton';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useQueryState } from '@/hooks/useQueryParam';

// The drop zone is a sibling of NavHeader inside a column flex container.
// `height: 100%` would size it to the FULL container (its content floor keeps
// flex-shrink from absorbing the nav height), pushing the bottom prompt input
// below the clipped edge by exactly the nav header height. `flex: 1` +
// `minHeight: 0` sizes it to the remaining space instead.
const dropZoneStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  minHeight: 0,
  width: '100%',
};

interface CreateGenerationPageProps {
  /** Disable the drop zone overlay/handling (e.g. model has no reference support). */
  dragDisabled?: boolean;
  /**
   * When provided, the whole creation area becomes a drag-and-drop upload zone.
   * Files dropped anywhere below the nav header are routed here.
   */
  onUploadFiles?: (files: File[]) => void | Promise<void>;
  path: string;
  PromptInput: ComponentType<{ disableAnimation?: boolean; showTitle?: boolean }>;
  Workspace: ComponentType<{ embedInput?: boolean }>;
}

const CreateGenerationPage = memo<CreateGenerationPageProps>(
  ({ path, Workspace, PromptInput, dragDisabled, onUploadFiles }) => {
    const isPersonalPath = useMatch({ end: true, path });
    const isWorkspacePath = useMatch({ end: true, path: `/:workspaceSlug${path}` });
    const [topic] = useQueryState('topic');
    const isMobile = useIsMobile();
    const isHome = !topic;

    if (!isPersonalPath && !isWorkspacePath) return null;

    const content = (
      <Flexbox
        height={'100%'}
        style={{
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          // 移动端为底部主导航(48px)留出空间,避免输入框被遮挡
          paddingBottom: isMobile ? 48 : undefined,
        }}
        width={'100%'}
      >
        <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }} width={'100%'}>
          {/* 移动端 fullWidth:去掉宽度上限与两侧留白,内容占满屏宽 */}
          <WideScreenContainer fullWidth={isMobile} wrapperStyle={{ minHeight: '100%' }}>
            <AnimatePresence initial={false} mode="wait">
              {isHome ? (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  initial={{ opacity: 0, y: 8 }}
                  key="home-input"
                  transition={{ duration: 0.24, ease: 'easeOut' }}
                >
                  <Flexbox
                    align={'center'}
                    justify={'center'}
                    style={{ minHeight: 'calc(100vh - 180px)' }}
                    width={'100%'}
                  >
                    <PromptInput disableAnimation showTitle />
                  </Flexbox>
                </motion.div>
              ) : (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  initial={{ opacity: 0, y: 10 }}
                  key="topic-workspace"
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  <Workspace embedInput={false} />
                </motion.div>
              )}
            </AnimatePresence>
          </WideScreenContainer>
        </Flexbox>
        <AnimatePresence initial={false}>
          {!isHome && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              key="bottom-input"
              transition={{ delay: 0.04, duration: 0.2, ease: 'easeOut' }}
            >
              <WideScreenContainer
                fullWidth={isMobile}
                style={{ marginTop: -8, paddingBlockEnd: 12 }}
              >
                <PromptInput disableAnimation showTitle={false} />
              </WideScreenContainer>
            </motion.div>
          )}
        </AnimatePresence>
      </Flexbox>
    );

    return (
      <>
        <NavHeader
          // 宽屏切换按钮仅桌面端有意义;移动端不渲染,避免死按钮
          right={isMobile ? undefined : <WideScreenButton />}
          styles={{
            center: {
              alignItems: 'center',
              display: 'flex',
              justifyContent: 'center',
              minWidth: 0,
            },
            left: { flex: 1, minWidth: 0 },
            right: { flex: 1, minWidth: 0 },
          }}
        />
        {onUploadFiles ? (
          <DragUploadZone
            disabled={dragDisabled}
            // Generation upload only accepts images; keep the overlay copy/icons
            // image-only so a dropped PDF/text file isn't falsely invited.
            enabledFiles={false}
            style={dropZoneStyle}
            onUploadFiles={onUploadFiles}
          >
            {content}
          </DragUploadZone>
        ) : (
          content
        )}
      </>
    );
  },
);

CreateGenerationPage.displayName = 'CreateGenerationPage';

export default CreateGenerationPage;
