'use client';

import { type FlexboxProps } from '@lobehub/ui';
import { Flexbox, Tooltip } from '@lobehub/ui';
import { Badge } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { isUndefined } from 'es-toolkit/compat';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { useClientDataSWR } from '@/libs/swr';
import { statsKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { agentService } from '@/services/agent';
import { messageService } from '@/services/message';
import { topicService } from '@/services/topic';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { formatShortenNumber } from '@/utils/format';
import { today } from '@/utils/time';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    padding-block: 6px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorFillTertiary};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  count: css`
    font-size: 16px;
    font-weight: bold;
    line-height: 1.2;
  `,
  title: css`
    font-size: 12px;
    line-height: 1.2;
    color: ${cssVar.colorTextDescription};
  `,
  today: css`
    font-size: 12px;
  `,
}));

const DataStatistics = memo<Omit<FlexboxProps, 'children'>>(({ style, ...rest }) => {
  const mobile = useServerConfigStore((s) => s.isMobile);
  const enableBusinessFeatures = useServerConfigStore(
    serverConfigSelectors.enableBusinessFeatures,
  );
  // assistants (counted from the agents table — the sidebar list source of truth)
  const { data: agents, isLoading: agentsLoading } = useClientDataSWR(statsKeys.countAgents(), () =>
    agentService.countAgents(),
  );
  // topics
  const { data: topics, isLoading: topicsLoading } = useClientDataSWR(statsKeys.countTopics(), () =>
    topicService.countTopics(),
  );
  // messages
  const { data: { messages, messagesToday } = {}, isLoading: messagesLoading } = useClientDataSWR(
    statsKeys.countMessages(),
    async () => ({
      messages: await messageService.countMessages(),
      messagesToday: await messageService.countMessages({
        startDate: today().format('YYYY-MM-DD'),
      }),
    }),
  );
  // 积分余额:商业功能开启时用它替换"话题"卡(与套餐/积分页同一数据源)。
  // PC 端昵称面板与移动端「我的」页对齐——两端口径一致(会话/积分/消息)。
  const { data: creditBalance, isLoading: creditsLoading } = useClientDataSWR(
    enableBusinessFeatures ? 'credit-balance-stat' : null,
    () => lambdaClient.topUp.balance.query(),
  );

  const { t } = useTranslation('common');

  const loading = <NeuralNetworkLoading size={20} />;

  const items = [
    {
      count: agentsLoading || isUndefined(agents) ? loading : agents,
      key: 'sessions',
      title: t('dataStatistics.sessions'),
    },
    {
      count: topicsLoading || isUndefined(topics) ? loading : topics,
      key: 'topics',
      title: t('dataStatistics.topics'),
    },
    {
      count: messagesLoading || isUndefined(messages) ? loading : messages,
      countToady: messagesToday,
      key: 'messages',
      title: t('dataStatistics.messages'),
    },
  ];

  // 商业功能开启:三卡改为 会话/积分余额/消息 —— 积分对用户是更高频
  // 关注的信息,话题数可从会话列表自行感知。PC 端昵称面板与移动端「我的」页对齐。
  if (enableBusinessFeatures) {
    items[1] = {
      count:
        creditsLoading || isUndefined(creditBalance?.remaining)
          ? loading
          : formatShortenNumber(creditBalance.remaining),
      key: 'credits',
      title: t('subscription:tab.credits'),
    };
  }

  return (
    <Flexbox
      horizontal
      align={'center'}
      gap={4}
      paddingInline={8}
      style={{ marginBottom: 8, ...style }}
      width={'100%'}
      {...rest}
    >
      {items.map((item) => {
        if (item.key === 'messages') {
          const showBadge = Boolean(item.countToady && item.countToady > 0);
          return (
            <Flexbox
              horizontal
              align={'center'}
              className={styles.card}
              flex={showBadge && !mobile ? 2 : 1}
              gap={4}
              justify={'space-between'}
              key={item.key}
            >
              <Flexbox gap={2}>
                <div className={styles.count}>{formatShortenNumber(item.count)}</div>
                <div className={styles.title}>{item.title}</div>
              </Flexbox>
              {showBadge && (
                <Tooltip title={t('dataStatistics.today')}>
                  <Badge
                    count={`+${item.countToady}`}
                    style={{
                      background: cssVar.colorSuccess,
                      color: cssVar.colorSuccessBg,
                      cursor: 'pointer',
                    }}
                  />
                </Tooltip>
              )}
            </Flexbox>
          );
        }

        return (
          <Flexbox className={styles.card} flex={1} gap={2} key={item.key}>
            <Flexbox horizontal>
              <div className={styles.count}>{formatShortenNumber(item.count)}</div>
            </Flexbox>
            <div className={styles.title}>{item.title}</div>
          </Flexbox>
        );
      })}
    </Flexbox>
  );
});

export default DataStatistics;
