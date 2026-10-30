'use client';

import { Flexbox } from '@lobehub/ui';
import { App, Button, Card, Empty, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useMemo } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const statusColor: Record<string, string> = {
  cancelled: 'default',
  failed: 'error',
  paid: 'success',
  pending: 'processing',
  refunded: 'warning',
};

const statusLabel: Record<string, string> = {
  cancelled: '已取消',
  failed: '失败',
  paid: '已支付',
  pending: '待支付',
  refunded: '已退款',
};

const BillingPage: FC = () => {
  const { data, isLoading, mutate } = useSWR('payment-orders', () =>
    lambdaClient.spend.paymentOrders.query({ limit: 50 }),
  );

  const columns = useMemo(
    () => [
      {
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (v: string | Date) => dayjs(v).format('YYYY-MM-DD HH:mm'),
        title: '下单时间',
        width: 150,
      },
      {
        dataIndex: 'subject',
        key: 'subject',
        title: '商品',
      },
      {
        dataIndex: 'orderType',
        key: 'orderType',
        render: (t: string) =>
          t === 'topup' ? <Tag color="blue">积分充值</Tag> : <Tag color="purple">套餐订阅</Tag>,
        title: '类型',
        width: 100,
      },
      {
        dataIndex: 'amount',
        key: 'amount',
        render: (a: string) => `¥${a}`,
        title: '金额',
        width: 100,
      },
      {
        dataIndex: 'channel',
        key: 'channel',
        render: (c: string) => (c === 'wechat' ? '微信' : c === 'alipay' ? '支付宝' : c || '-'),
        title: '支付方式',
        width: 90,
      },
      {
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => (
          <Tag color={statusColor[s] || 'default'}>{statusLabel[s] || s}</Tag>
        ),
        title: '状态',
        width: 90,
      },
      {
        dataIndex: 'paidAt',
        key: 'paidAt',
        render: (v: string | Date | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
        title: '支付时间',
        width: 150,
      },
      {
        dataIndex: 'outTradeNo',
        key: 'outTradeNo',
        render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span>,
        title: '订单号',
      },
    ],
    [],
  );

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>账单</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', marginTop: 4 }}>
          订阅套餐与积分充值的支付记录
        </div>
      </div>

      <Card extra={<Button onClick={() => mutate()}>刷新</Button>} size="small" title="支付订单">
        <Table
          columns={columns as any}
          dataSource={data || []}
          loading={isLoading}
          locale={{ emptyText: <Empty description="暂无账单记录" /> }}
          pagination={{ pageSize: 15 }}
          rowKey="id"
          size="small"
        />
      </Card>
    </Flexbox>
  );
};

export default BillingPage;
