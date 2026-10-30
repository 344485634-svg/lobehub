'use client';

import { Flexbox } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { App, Card, Col, DatePicker, Row, Statistic, Table } from 'antd';
import dayjs from 'dayjs';
import { type FC, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const { RangePicker } = DatePicker;

const AdminDashboard: FC = () => {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const from = range?.[0]?.startOf('day').toISOString();
  const to = range?.[1]?.endOf('day').toISOString();

  const { data, isLoading } = useSWR(
    ['admin-dashboard-stats', from, to],
    () => lambdaClient.admin.getDashboardStats.query({ from, to }),
  );

  const rankColumns = [
    {
      dataIndex: 'rank',
      key: 'rank',
      render: (_: any, __: any, idx: number) => (
        <span style={{ color: idx < 3 ? '#faad14' : undefined, fontWeight: idx < 3 ? 700 : 400 }}>
          {idx + 1}
        </span>
      ),
      title: '排名',
      width: 60,
    },
    { dataIndex: 'email', key: 'email', title: '用户' },
    {
      dataIndex: 'consumed',
      key: 'consumed',
      render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{v.toLocaleString()} 积分</span>,
      title: '消耗积分',
      width: 140,
    },
  ];

  return (
    <Flexbox gap={24} padding={24}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>平台概览</div>

      <Flexbox gap={8} horizontal style={{ alignItems: 'center' }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>时间筛选：</span>
        <RangePicker
          value={range}
          onChange={(v) => setRange(v as any)}
        />
        {range && (
          <Button size="small" onClick={() => setRange(null)}>重置</Button>
        )}
      </Flexbox>

      <Row gutter={[16, 16]}>
        <Col lg={4} md={8} xs={12}>
          <Card size="small">
            <Statistic loading={isLoading} title="总用户数" value={data?.totalUsers ?? 0} />
          </Card>
        </Col>
        <Col lg={4} md={8} xs={12}>
          <Card size="small">
            <Statistic loading={isLoading} title="今日新增用户" value={data?.newUsersToday ?? 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        {range && (
          <Col lg={4} md={8} xs={12}>
            <Card size="small">
              <Statistic loading={isLoading} title="区间新增用户" value={data?.newUsersInRange ?? 0} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
        )}
        <Col lg={4} md={8} xs={12}>
          <Card size="small">
            <Statistic
              loading={isLoading}
              precision={2}
              prefix="¥"
              title="今日订阅金额"
              value={Number(data?.subOrdersToday?.total ?? 0)}
              valueStyle={{ color: '#52c41a' }}
            />
            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.65 }}>
              共 {data?.subOrdersToday?.count ?? 0} 笔订单
            </div>
          </Card>
        </Col>
        <Col lg={4} md={8} xs={12}>
          <Card size="small">
            <Statistic
              loading={isLoading}
              precision={2}
              prefix="¥"
              title="今日积分充值"
              value={Number(data?.topupOrdersToday?.total ?? 0)}
              valueStyle={{ color: '#1677ff' }}
            />
            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.65 }}>
              共 {data?.topupOrdersToday?.count ?? 0} 笔充值
            </div>
          </Card>
        </Col>
        {range && (
          <Col lg={4} md={8} xs={12}>
            <Card size="small">
              <Statistic
                loading={isLoading}
                precision={2}
                prefix="¥"
                title="区间总收入"
                value={Number(data?.totalOrdersInRange?.total ?? 0)}
              />
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.65 }}>
                共 {data?.totalOrdersInRange?.count ?? 0} 笔
              </div>
            </Card>
          </Col>
        )}
      </Row>

      <Card
        size="small"
        title={
          <Flexbox horizontal gap={8} style={{ alignItems: 'center' }}>
            <span>积分消耗排行榜（TOP 20）</span>
            {range && (
              <span style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
                {range[0].format('YYYY-MM-DD')} ~ {range[1].format('YYYY-MM-DD')}
              </span>
            )}
            {!range && <span style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>全部时间</span>}
          </Flexbox>
        }
      >
        <Table
          columns={rankColumns as any}
          dataSource={(data?.ranking ?? []).map((r, i) => ({ ...r, key: r.userId, rank: i + 1 }))}
          loading={isLoading}
          pagination={false}
          size="small"
        />
      </Card>
    </Flexbox>
  );
};

export default AdminDashboard;
