import { Accordion, Flexbox } from '@lobehub/ui';
import React, { type Key, memo, useCallback, useMemo } from 'react';

import { useAgentStore } from '@/store/agent';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import Topic from './Topic';

export enum ChatSidebarKey {
  Tasks = 'tasks',
  Topic = 'topic',
}

// Topic expanded by default. Tasks accordion removed for commercial simplification.
const DEFAULT_EXPANDED: Record<string, boolean> = {
  [ChatSidebarKey.Topic]: true,
};

const Body = memo(() => {
  const agentId = useAgentStore((s) => s.activeAgentId);
  const sections = useGlobalStore(systemStatusSelectors.agentSidebarSections(agentId));
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const expandedKeys = useMemo(() => {
    const resolved = { ...DEFAULT_EXPANDED, ...sections };
    return Object.keys(resolved).filter((key) => resolved[key] && key !== ChatSidebarKey.Tasks);
  }, [sections]);

  const handleExpandedChange = useCallback(
    (keys: Key[]) => {
      if (!agentId) return;
      updateSystemStatus({
        expandAgentSidebarSectionsByAgent: {
          [agentId]: {
            [ChatSidebarKey.Topic]: keys.includes(ChatSidebarKey.Topic),
          },
        },
      });
    },
    [agentId, updateSystemStatus],
  );

  return (
    <Flexbox paddingInline={4}>
      <Accordion expandedKeys={expandedKeys} gap={8} onExpandedChange={handleExpandedChange}>
        <Topic
          expanded={expandedKeys.includes(ChatSidebarKey.Topic)}
          itemKey={ChatSidebarKey.Topic}
        />
      </Accordion>
    </Flexbox>
  );
});

export default Body;
