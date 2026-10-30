import { type ItemType } from '@lobehub/ui';
import { Flexbox, Icon, SearchBar, stopPropagation } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ScrollSignalProvider } from '@/features/ChatInput/ActionBar/Tools/ScrollSignalContext';
import ToolsList from '@/features/ChatInput/ActionBar/Tools/ToolsList';

import Empty from './Empty';

const styles = createStaticStyles(({ css }) => ({
  header: css`
    padding-block: 8px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorFill};
    background: transparent;
  `,
  scroller: css`
    overflow: hidden auto;
  `,
}));

const filterItems = (items: ItemType[], keyword: string): ItemType[] => {
  const lower = keyword.toLowerCase();

  return items
    .map((item) => {
      if (!item) return null;

      if (item.type === 'group' && 'children' in item && item.children) {
        const filtered = item.children.filter((child) => {
          if (!child) return false;
          const key = String(child.key || '').toLowerCase();
          return key.includes(lower);
        });
        if (filtered.length === 0) return null;
        return { ...item, children: filtered };
      }

      if (item.type === 'divider') return item;

      const key = String('key' in item ? item.key : '').toLowerCase();
      return key.includes(lower) ? item : null;
    })
    .filter(Boolean) as ItemType[];
};

interface PopoverContentProps {
  items: ItemType[];
  onClose?: () => void;
  /** @deprecated 技能商店已关闭，保留 prop 以兼容调用方 */
  onOpenStore?: () => void;
}

/**
 * 商业化：仅展示可添加的基础技能 / 管理员技能，不提供技能商店与连接器管理入口。
 */
const PopoverContent = memo<PopoverContentProps>(({ items }) => {
  const { t } = useTranslation('setting');
  const [searchKeyword, setSearchKeyword] = useState('');

  const filteredItems = useMemo(
    () => (searchKeyword ? filterItems(items, searchKeyword) : items),
    [items, searchKeyword],
  );

  const isEmpty = filteredItems.length === 0;

  return (
    <Flexbox style={{ maxHeight: 500, width: '100%' }}>
      <div className={styles.header} onClick={stopPropagation}>
        <SearchBar
          allowClear
          placeholder={t('tools.search')}
          size="small"
          style={{ flex: 1 }}
          value={searchKeyword}
          variant="borderless"
          onChange={(e) => setSearchKeyword(e.target.value)}
          onKeyDown={stopPropagation}
        />
      </div>
      <ScrollSignalProvider className={styles.scroller} style={{ flex: 1 }}>
        {isEmpty ? <Empty /> : <ToolsList items={filteredItems} />}
      </ScrollSignalProvider>
    </Flexbox>
  );
});

PopoverContent.displayName = 'PopoverContent';

export default PopoverContent;
