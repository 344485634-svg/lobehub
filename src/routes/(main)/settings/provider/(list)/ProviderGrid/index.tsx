'use client';

import { Flexbox, Grid, Tag, Text } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';

import Card from './Card';

const loadingArr = Array.from({ length: 12 })
  .fill('-')
  .map((item, index) => `${index}x${item}`);

type ListProps = {
  onProviderSelect: (provider: string) => void;
};

const List = memo((props: ListProps) => {
  const { onProviderSelect } = props;
  const { t } = useTranslation('modelProvider');
  // 商业化白标:设置页服务商列表仅显示 newapi(LIUMA 官方 API)。
  // 只在 UI 层过滤,不动 selectors,以免影响模型选择器等其它处的已启用模型调用。
  const enabledList = useAiInfraStore(aiProviderSelectors.enabledAiProviderList, isEqual).filter(
    (p) => p.id === 'newapi',
  );
  const disabledList = useAiInfraStore(aiProviderSelectors.disabledAiProviderList, isEqual).filter(
    (p) => p.id === 'newapi',
  );
  const disabledCustomList = useAiInfraStore(
    aiProviderSelectors.disabledCustomAiProviderList,
    isEqual,
  ).filter((p) => p.id === 'newapi');
  const [initAiProviderList] = useAiInfraStore((s) => [s.initAiProviderList]);
  // Own the same list fetch (SWR-deduped with ProviderMenu) so a failed load
  // shows error + Retry here too, instead of a permanent skeleton grid
  // (`initAiProviderList` only flips on success).
  const useFetchAiProviderList = useAiInfraStore((s) => s.useFetchAiProviderList);
  const { error, mutate } = useFetchAiProviderList();

  const skeleton = (
    <Flexbox gap={24} paddingBlock={'0 16px'}>
      <Flexbox horizontal align={'center'} gap={4}>
        <Text strong style={{ fontSize: 16 }}>
          {t('list.title.enabled')}
        </Text>
      </Flexbox>
      <Grid gap={16} rows={3}>
        {loadingArr.map((item) => (
          <Card
            loading
            enabled={false}
            id={item}
            key={item}
            source={'builtin'}
            onProviderSelect={onProviderSelect}
          />
        ))}
      </Grid>
    </Flexbox>
  );

  return (
    <AsyncBoundary
      data={initAiProviderList ? true : undefined}
      error={error}
      errorVariant={'page'}
      isLoading={!initAiProviderList && !error}
      loading={skeleton}
      onRetry={() => mutate()}
    >
      <Flexbox gap={24}>
        <Flexbox horizontal align={'center'} gap={8}>
          <Text strong style={{ fontSize: 18 }}>
            {t('list.title.enabled')}
          </Text>
          <Tag>{enabledList.length}</Tag>
        </Flexbox>
        <Grid gap={16} rows={3}>
          {enabledList.map((item) => (
            <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
          ))}
        </Grid>
      </Flexbox>
      {disabledCustomList.length > 0 && (
        <Flexbox gap={24}>
          <Flexbox horizontal align={'center'} gap={8}>
            <Text strong style={{ fontSize: 18 }}>
              {t('list.title.custom')}
            </Text>
            <Tag>{disabledCustomList.length}</Tag>
          </Flexbox>
          <Grid gap={16} rows={3}>
            {disabledCustomList.map((item) => (
              <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
            ))}
          </Grid>
        </Flexbox>
      )}
      {disabledList.length > 0 && (
        <Flexbox gap={24}>
          <Flexbox horizontal align={'center'} gap={8}>
            <Text strong style={{ fontSize: 18 }}>
              {t('list.title.disabled')}
            </Text>
            <Tag>{disabledList.length}</Tag>
          </Flexbox>
          <Grid gap={16} rows={3}>
            {disabledList.map((item) => (
              <Card {...item} key={item.id} onProviderSelect={onProviderSelect} />
            ))}
          </Grid>
        </Flexbox>
      )}
    </AsyncBoundary>
  );
});

export default List;
