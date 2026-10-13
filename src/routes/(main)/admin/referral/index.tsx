'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Tabs } from '@lobehub/ui/base-ui';
import { App, Card, Input, InputNumber, Space, Switch, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useEffect, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

type Tier = { label?: string; minAmount: number; rate: number };

const AdminReferralPage: FC = () => {
  const { message } = App.useApp();

  // ── 政策配置 ──────────────────────────────────────────────────────────────
  const { data, isLoading, mutate } = useSWR('admin-referral-policy', () =>
    lambdaClient.admin.getReferralPolicy.query(),
  );
  const [enabled, setEnabled] = useState(true);
  const [defaultRatePct, setDefaultRatePct] = useState(10);
  const [registrationCredits, setRegistrationCredits] = useState(0);
  const [inviteeRegistrationCredits, setInviteeRegistrationCredits] = useState(0);
  const [tiers, setTiers] = useState<Tier[]>([{ label: '默认', minAmount: 0, rate: 0.1 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(!!data.enabled);
    setDefaultRatePct(Math.round(Number(data.defaultRate || 0) * 1000) / 10);
    setRegistrationCredits(Number(data.registrationCredits) || 0);
    setInviteeRegistrationCredits(Number(data.inviteeRegistrationCredits) || 0);
    setTiers(
      (data.tiers || []).map((t) => ({
        label: t.label,
        minAmount: Number(t.minAmount) || 0,
        rate: Number(t.rate) || 0,
      })),
    );
  }, [data]);

  const handleSave = async () => {
    if (!tiers.length) {
      message.warning('至少配置一档返利');
      return;
    }
    for (const t of tiers) {
      if (t.rate < 0 || t.rate > 1) {
        message.error('返利比例需在 0–100% 之间');
        return;
      }
    }
    setSaving(true);
    try {
      await lambdaClient.admin.setReferralPolicy.mutate({
        defaultRate: Number(defaultRatePct) / 100,
        enabled,
        inviteeRegistrationCredits,
        registrationCredits,
        tiers: tiers.map((t) => ({
          label: t.label || `满 ¥${t.minAmount}`,
          minAmount: Number(t.minAmount) || 0,
          rate: Number(t.rate) || 0,
        })),
      });
      message.success('返利政策已保存');
      mutate();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // ── 奖励记录 ──────────────────────────────────────────────────────────────
  const [rewardPage, setRewardPage] = useState(1);
  const rewardPageSize = 20;
  const { data: rewards, isLoading: rewardsLoading } = useSWR(
    ['admin-referral-rewards', rewardPage],
    () =>
      lambdaClient.admin.adminListReferralRewards.query({
        page: rewardPage,
        pageSize: rewardPageSize,
      }),
  );

  // ── 档位表格列 ─────────────────────────────────────────────────────────────
  const tierColumns = [
    {
      key: 'minAmount',
      render: (_: unknown, __: Tier, index: number) => (
        <InputNumber
          min={0}
          style={{ width: 140 }}
          value={tiers[index]?.minAmount}
          onChange={(v) => {
            const n = [...tiers];
            n[index] = { ...n[index], minAmount: Number(v) || 0 };
            setTiers(n);
          }}
        />
      ),
      title: '最低消费（元）',
      width: 180,
    },
    {
      key: 'rate',
      render: (_: unknown, __: Tier, index: number) => (
        <InputNumber
          addonAfter="%"
          max={100}
          min={0}
          style={{ width: 140 }}
          value={Math.round((tiers[index]?.rate || 0) * 1000) / 10}
          onChange={(v) => {
            const n = [...tiers];
            n[index] = { ...n[index], rate: (Number(v) || 0) / 100 };
            setTiers(n);
          }}
        />
      ),
      title: '返利比例',
      width: 160,
    },
    {
      key: 'label',
      render: (_: unknown, __: Tier, index: number) => (
        <Input
          placeholder="档位名称（可选）"
          value={tiers[index]?.label}
          onChange={(e) => {
            const n = [...tiers];
            n[index] = { ...n[index], label: e.target.value };
            setTiers(n);
          }}
        />
      ),
      title: '名称',
    },
    {
      key: 'example',
      render: (_: unknown, row: Tier) => {
        const credits = Math.floor(100 * (row.rate || 0) * 100);
        return <span style={{ opacity: 0.7 }}>例：消费 ¥100 → 奖励 {credits} 积分</span>;
      },
      title: '示例',
      width: 220,
    },
    {
      key: 'actions',
      render: (_: unknown, __: Tier, index: number) => (
        <Button
          danger
          disabled={tiers.length <= 1}
          size="small"
          onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
        >
          删除
        </Button>
      ),
      title: '操作',
      width: 90,
    },
  ];

  const rewardColumns = [
    {
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: Date) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      title: '发放时间',
      width: 160,
    },
    { dataIndex: 'inviterEmail', key: 'inviterEmail', title: '邀请人邮箱' },
    { dataIndex: 'inviteeEmail', key: 'inviteeEmail', title: '被邀请人邮箱' },
    {
      dataIndex: 'spendAmount',
      key: 'spendAmount',
      render: (v: string) => (v ? `¥${Number(v).toFixed(2)}` : '-'),
      title: '触发消费金额',
      width: 130,
    },
    {
      dataIndex: 'rate',
      key: 'rate',
      render: (v: string) => (v ? `${(Number(v) * 100).toFixed(1)}%` : '-'),
      title: '返利比例',
      width: 100,
    },
    {
      dataIndex: 'credits',
      key: 'credits',
      render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600 }}>+{v}</span>,
      title: '奖励积分',
      width: 100,
    },
    {
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => (
        <Tag color={v === 'granted' ? 'green' : 'default'}>{v === 'granted' ? '已发放' : v}</Tag>
      ),
      title: '状态',
      width: 90,
    },
    {
      dataIndex: 'orderId',
      key: 'orderId',
      render: (v: string) =>
        v ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> : '-',
      title: '关联订单',
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>推荐奖励管理</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginTop: 4 }}>
          配置邀请返利政策并查看奖励发放记录
        </div>
      </div>

      <Tabs
        defaultActiveKey="policy"
        items={[
          {
            children: (
              <Flexbox gap={16}>
                <Card loading={isLoading} size="small" title="总开关">
                  <Flexbox horizontal gap={12} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>启用推荐奖励</span>
                    <Switch checked={enabled} onChange={setEnabled} />
                    <span style={{ marginLeft: 24 }}>默认返利比例</span>
                    <InputNumber
                      addonAfter="%"
                      max={100}
                      min={0}
                      style={{ width: 120 }}
                      value={defaultRatePct}
                      onChange={(v) => setDefaultRatePct(Number(v) || 0)}
                    />
                    <span style={{ fontSize: 12, opacity: 0.65 }}>未命中任何档位时使用</span>
                  </Flexbox>
                </Card>

                <Card
                  extra={<span style={{ fontSize: 12, opacity: 0.65 }}>好友注册时一次性发放</span>}
                  loading={isLoading}
                  size="small"
                  title="注册奖励"
                >
                  <Flexbox horizontal gap={16} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Flexbox horizontal gap={8} style={{ alignItems: 'center' }}>
                      <span>邀请人注册奖励</span>
                      <InputNumber
                        addonAfter="积分"
                        min={0}
                        style={{ width: 160 }}
                        value={registrationCredits}
                        onChange={(v) => setRegistrationCredits(Number(v) || 0)}
                      />
                      <span style={{ fontSize: 12, opacity: 0.65 }}>
                        好友完成注册后，邀请人获得
                      </span>
                    </Flexbox>
                    <Flexbox horizontal gap={8} style={{ alignItems: 'center' }}>
                      <span>新用户注册奖励</span>
                      <InputNumber
                        addonAfter="积分"
                        min={0}
                        style={{ width: 160 }}
                        value={inviteeRegistrationCredits}
                        onChange={(v) => setInviteeRegistrationCredits(Number(v) || 0)}
                      />
                      <span style={{ fontSize: 12, opacity: 0.65 }}>
                        被邀请新用户完成注册后获得
                      </span>
                    </Flexbox>
                  </Flexbox>
                </Card>

                <Card
                  size="small"
                  title="消费返利档位"
                  extra={
                    <Space>
                      <Button
                        onClick={() => setTiers([...tiers, { label: '', minAmount: 0, rate: 0.1 }])}
                      >
                        添加档位
                      </Button>
                      <Button loading={saving} type="primary" onClick={handleSave}>
                        保存配置
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    columns={tierColumns as any}
                    dataSource={tiers.map((t, i) => ({ ...t, key: i }))}
                    pagination={false}
                    size="middle"
                  />
                  <div style={{ fontSize: 12, marginTop: 12, opacity: 0.65 }}>
                    匹配规则：按「最低消费」从高到低匹配，命中第一档即用该比例。奖励积分 =
                    floor(消费金额 × 比例 × 100)。
                  </div>
                </Card>
              </Flexbox>
            ),
            key: 'policy',
            label: '奖励政策配置',
          },
          {
            children: (
              <Card size="small" title="奖励发放记录">
                <Table
                  columns={rewardColumns as any}
                  dataSource={rewards?.rewards ?? []}
                  loading={rewardsLoading}
                  rowKey="id"
                  size="small"
                  pagination={{
                    current: rewardPage,
                    onChange: setRewardPage,
                    pageSize: rewardPageSize,
                    showSizeChanger: false,
                    showTotal: (total) => `共 ${total} 条`,
                    total: rewards?.total ?? 0,
                  }}
                />
              </Card>
            ),
            key: 'records',
            label: '奖励发放记录',
          },
        ]}
      />
    </Flexbox>
  );
};

export default AdminReferralPage;
