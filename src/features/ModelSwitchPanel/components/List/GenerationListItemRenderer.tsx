'use client';

import {
  DropdownMenuPopup,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuSubmenuRoot,
  DropdownMenuSubmenuTrigger,
  Flexbox,
  menuSharedStyles,
} from '@lobehub/ui';
import { cssVar, cx } from 'antd-style';
import type { ComponentType } from 'react';
import { memo, useState } from 'react';

import { ProviderItemRender } from '@/components/ModelSelect';
import type { PricingMode } from '@/features/ModelSwitchPanel/components/ModelDetailPanel';
import ModelDetailPanel from '@/features/ModelSwitchPanel/components/ModelDetailPanel';
import { styles as modelSwitchPanelStyles } from '@/features/ModelSwitchPanel/styles';
import type { ListItem } from '@/features/ModelSwitchPanel/types';
import { menuKey } from '@/features/ModelSwitchPanel/utils';
import type { EnabledProviderWithModels } from '@/types/index';

import GenerationMultipleProvidersItem from './GenerationMultipleProvidersItem';

export interface GenerationListItemRendererProps {
  activeKey: string;
  enabledList: EnabledProviderWithModels[];
  item: ListItem;
  ModelItemComponent: ComponentType<any>;
  onClose: () => void;
  onModelChange: (modelId: string, providerId: string) => void;
  pricingMode?: PricingMode;
}

const GenerationListItemRenderer = memo<GenerationListItemRendererProps>(
  ({ item, activeKey, onClose, onModelChange, enabledList, ModelItemComponent, pricingMode }) => {
    const [detailOpen, setDetailOpen] = useState(false);

    switch (item.type) {
      case 'no-provider': {
        return (
          <Flexbox
            horizontal
            className={modelSwitchPanelStyles.menuItem}
            gap={8}
            style={{ color: cssVar.colorTextTertiary, cursor: 'default' }}
          >
            暂无可用模型，请联系管理员在后台开启
          </Flexbox>
        );
      }

      case 'group-header': {
        return (
          <Flexbox
            horizontal
            className={modelSwitchPanelStyles.groupHeader}
            justify="space-between"
            paddingBlock="12px 4px"
            paddingInline="12px 8px"
          >
            <ProviderItemRender
              logo={item.provider.logo}
              name={item.provider.name}
              provider={item.provider.id}
              source={item.provider.source}
            />
          </Flexbox>
        );
      }

      case 'empty-model': {
        return (
          <Flexbox
            horizontal
            className={modelSwitchPanelStyles.menuItem}
            gap={8}
            style={{ color: cssVar.colorTextTertiary, cursor: 'default' }}
          >
            该服务商暂无可用模型，请联系管理员开启
          </Flexbox>
        );
      }

      case 'provider-model-item': {
        const key = menuKey(item.provider.id, item.model.id);
        const isActive = key === activeKey;
        return (
          <Flexbox style={{ marginBlock: 1, marginInline: 4 }}>
            <DropdownMenuSubmenuRoot open={detailOpen} onOpenChange={setDetailOpen}>
              <DropdownMenuSubmenuTrigger
                style={{ paddingBlock: 8, paddingInline: 8 }}
                className={cx(
                  menuSharedStyles.item,
                  isActive && modelSwitchPanelStyles.menuItemActive,
                )}
                onClick={() => {
                  setDetailOpen(false);
                  onModelChange(item.model.id, item.provider.id);
                  onClose();
                }}
              >
                <ModelItemComponent
                  {...item.model}
                  providerId={item.provider.id}
                  showBadge={false}
                  showPopover={false}
                />
              </DropdownMenuSubmenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuPositioner anchor={null} placement="right" sideOffset={12}>
                  <DropdownMenuPopup className={modelSwitchPanelStyles.detailPopup}>
                    <ModelDetailPanel
                      enabledList={enabledList}
                      model={item.model.id}
                      pricingMode={pricingMode}
                      provider={item.provider.id}
                    />
                  </DropdownMenuPopup>
                </DropdownMenuPositioner>
              </DropdownMenuPortal>
            </DropdownMenuSubmenuRoot>
          </Flexbox>
        );
      }

      case 'model-item-single': {
        const singleProvider = item.data.providers[0];
        const key = menuKey(singleProvider.id, item.data.model.id);
        const isActive = key === activeKey;
        return (
          <Flexbox style={{ marginBlock: 1, marginInline: 4 }}>
            <DropdownMenuSubmenuRoot open={detailOpen} onOpenChange={setDetailOpen}>
              <DropdownMenuSubmenuTrigger
                style={{ paddingBlock: 8, paddingInline: 8 }}
                className={cx(
                  menuSharedStyles.item,
                  isActive && modelSwitchPanelStyles.menuItemActive,
                )}
                onClick={() => {
                  setDetailOpen(false);
                  onModelChange(item.data.model.id, singleProvider.id);
                  onClose();
                }}
              >
                <ModelItemComponent
                  {...item.data.model}
                  providerId={singleProvider.id}
                  showBadge={false}
                  showPopover={false}
                />
              </DropdownMenuSubmenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuPositioner anchor={null} placement="right" sideOffset={12}>
                  <DropdownMenuPopup className={modelSwitchPanelStyles.detailPopup}>
                    <ModelDetailPanel
                      enabledList={enabledList}
                      model={item.data.model.id}
                      pricingMode={pricingMode}
                      provider={singleProvider.id}
                    />
                  </DropdownMenuPopup>
                </DropdownMenuPositioner>
              </DropdownMenuPortal>
            </DropdownMenuSubmenuRoot>
          </Flexbox>
        );
      }

      case 'model-item-multiple': {
        return (
          <GenerationMultipleProvidersItem
            ModelItemComponent={ModelItemComponent}
            activeKey={activeKey}
            enabledList={enabledList}
            item={item}
            pricingMode={pricingMode}
            onClose={onClose}
            onModelChange={onModelChange}
          />
        );
      }

      default: {
        return null;
      }
    }
  },
);

GenerationListItemRenderer.displayName = 'GenerationListItemRenderer';

export default GenerationListItemRenderer;
