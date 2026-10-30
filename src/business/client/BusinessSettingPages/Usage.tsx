'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Card, Empty, Table } from 'antd';
import dayjs from 'dayjs';
import { type FC, useMemo } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';
import { formatProviderModelLabel } from '@/business/client/providerBrand';

const reasonLabel: Record<string, string> = {
  adjust: '管理员操作',
  admin_adjust: '管理员操作',
  chat: '对话消耗',
  chat_tokens: '对话消耗',
  grant: '赠送',
  image: '图片消耗',
  image_request: '图片消耗',
  plan_expired: '套餐过期作废',
  plan_grant: '套餐到账',
  referral: '推荐奖励',
  refund: '退款返还',
  topup: '积分充值',
  video: '视频消耗',
  video_generation: '视频消耗',
};

const UsagePage: FC = () => {
  const { data: balance } = useSWR('credit-balance', () => lambdaClient.topUp.balance.query());
  const {
    data: ledger,
    isLoading,
    mutate,
  } = useSWR('credit-ledger', () => lambdaClient.spend.creditLedger.query({ limit: 100 }));

  const columns = useMemo(
    () => [
      {
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (v: string | Date) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
        title: '时间',
        width: 170,
      },
      {
        dataIndex: 'reason',
        key: 'reason',
        render: (r: string) => reasonLabel[r] || r,
        title: '类型',
        width: 110,
      },
      {
        key: 'model',
        render: (_: unknown, row: any) => (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {formatProviderModelLabel(row.provider, row.model)}
          </span>
        ),
        title: '模型',
      },
      {
        dataIndex: 'amount',
        key: 'amount',
        render: (n: number, row: any) => {
          const amt = Number(n) || 0;
          const meta = row?.meta || {};
          const original = Number(meta.originalAmount) || 0;
          const hasDiscount = original > 0 && original > Math.abs(amt);
          const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
          const sign = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));
          return (
            <span style={{ color: '#cf1322', fontWeight: 600 }}>
              {hasDiscount && (
                <>
                  <span style={{ color: 'var(--lobe-color-text-secondary)', textDecoration: 'line-through', marginRight: 6 }}>
                    {sign(-original)}
                  </span>
                  <span style={{ color: '#389e0d', fontWeight: 700 }}>{sign(amt)}</span>
                </>
              )}
              {!hasDiscount && sign(amt)}
            </span>
          );
        },
        title: '积分变动',
        width: 130,
      },
      {
        dataIndex: 'balanceAfter',
        key: 'balanceAfter',
        render: (n: number | null) => (n == null ? '-' : n),
        title: '余额',
        width: 90,
      },
      {
        key: 'meta',
        render: (_: unknown, row: any) => {
          const m = row.meta || {};
          const parts: string[] = [];
          if (m.inputTokens != null) parts.push(`入 ${m.inputTokens}`);
          if (m.outputTokens != null) parts.push(`出 ${m.outputTokens}`);
          if (m.duration != null) parts.push(`${m.duration}s`);
          if (m.resolution) parts.push(String(m.resolution));
          if (m.imageNum != null) parts.push(`${m.imageNum} 张`);
          if (m.discountRate != null && Number(m.discountRate) < 1) {
            parts.push(`套餐${(Number(m.discountRate) * 10).toFixed(1).replace(/\.0$/, '')}折`);
          }
          return parts.length ? parts.join(' · ') : '-';
        },
        title: '明细',
      },
    ],
    [],
  );

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>用量明细</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', marginTop: 4 }}>
          查看模型调用与积分消耗记录
        </div>
      </div>

      <Flexbox gap={12} horizontal style={{ flexWrap: 'wrap' }}>
        <Card size="small" style={{ minWidth: 160 }}>
          <div style={{ opacity: 0.65 }}>剩余积分</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{balance?.remaining ?? '-'}</div>
        </Card>
        <Card size="small" style={{ minWidth: 160 }}>
          <div style={{ opacity: 0.65 }}>套餐剩余</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{balance?.planRemaining ?? '-'}</div>
        </Card>
        <Card size="small" style={{ minWidth: 160 }}>
          <div style={{ opacity: 0.65 }}>充值积分余额</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{balance?.topupBalance ?? '-'}</div>
        </Card>
        <Card size="small" style={{ minWidth: 160 }}>
          <div style={{ opacity: 0.65 }}>推荐奖励积分余额</div>
          <div style={{ color: '#fa8c16', fontSize: 22, fontWeight: 600 }}>
            {balance?.rewardBalance ?? '-'}
          </div>
        </Card>
        <Button onClick={() => mutate()}>刷新</Button>
      </Flexbox>

      <Card size="small" title="消耗 / 到账记录">
        <Table
          columns={columns as any}
          dataSource={ledger || []}
          loading={isLoading}
          locale={{ emptyText: <Empty description="暂无用量记录" /> }}
          pagination={{ pageSize: 20 }}
          rowKey="id"
          size="small"
        />
      </Card>
    </Flexbox>
  );
};

export default UsagePage;
