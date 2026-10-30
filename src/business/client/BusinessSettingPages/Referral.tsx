'use client';

import { Flexbox } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { App, Card, Empty, Input, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useMemo, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const ReferralPage: FC = () => {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR('referral-overview', () =>
    lambdaClient.referral.overview.query(),
  );
  const [editing, setEditing] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [saving, setSaving] = useState(false);

  const copy = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(okMsg);
    } catch {
      message.error('复制失败');
    }
  };

  const handleSaveCode = async () => {
    setSaving(true);
    try {
      await lambdaClient.referral.updateCode.mutate({ code: codeInput });
      message.success('邀请码已更新');
      setEditing(false);
      mutate();
    } catch (e: any) {
      message.error(e?.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };


  const rewardColumns = useMemo(
    () => [
      {
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (v: string | Date) => dayjs(v).format('YYYY-MM-DD HH:mm'),
        title: '时间',
        width: 150,
      },
      {
        dataIndex: 'spendAmount',
        key: 'spendAmount',
        render: (a: string) => `¥${a}`,
        title: '好友消费',
        width: 100,
      },
      {
        dataIndex: 'rate',
        key: 'rate',
        render: (r: string) => `${(Number(r) * 100).toFixed(0)}%`,
        title: '返利比例',
        width: 90,
      },
      {
        dataIndex: 'credits',
        key: 'credits',
        render: (c: number) => <span style={{ color: '#389e0d', fontWeight: 600 }}>+{c}</span>,
        title: '获得积分',
        width: 100,
      },
      {
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => <Tag color="success">{s === 'granted' ? '已到账' : s}</Tag>,
        title: '状态',
        width: 90,
      },
    ],
    [],
  );

  const tiers = data?.policy?.tiers || [];

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>推荐奖励</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', marginTop: 4 }}>
          一级分销：邀请好友消费，按消费金额比例返还积分
        </div>
      </div>

      <Flexbox gap={12} horizontal style={{ flexWrap: 'wrap' }}>
        <Card size="small" style={{ minWidth: 160 }}>
          <div style={{ opacity: 0.65 }}>累计奖励积分</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data?.totalRewardCredits ?? 0}</div>
        </Card>
        <Card size="small" style={{ minWidth: 160 }}>
          <div style={{ opacity: 0.65 }}>邀请人数</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data?.inviteeCount ?? 0}</div>
        </Card>
      </Flexbox>

      <Card loading={isLoading} size="small" title="我的邀请">
        <Flexbox gap={12}>
          <Flexbox gap={8} horizontal style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span>邀请码：</span>
            {editing ? (
              <>
                <Input
                  maxLength={8}
                  style={{ width: 140 }}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                />
                <Button loading={saving} type="primary" onClick={handleSaveCode}>
                  保存
                </Button>
                <Button
                  onClick={() => {
                    setEditing(false);
                    setCodeInput('');
                  }}
                >
                  取消
                </Button>
              </>
            ) : (
              <>
                <Tag style={{ fontSize: 16, padding: '4px 12px' }}>{data?.inviteCode || '-'}</Tag>
                <Button
                  onClick={() => {
                    setCodeInput(data?.inviteCode || '');
                    setEditing(true);
                  }}
                >
                  修改
                </Button>
                <Button
                  onClick={() => data?.inviteCode && copy(data.inviteCode, '邀请码已复制')}
                >
                  复制邀请码
                </Button>
              </>
            )}
          </Flexbox>

          <Flexbox gap={8} horizontal style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span>专属链接：</span>
            <code style={{ fontSize: 12, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data?.inviteLink || '-'}
            </code>
            <Button onClick={() => data?.inviteLink && copy(data.inviteLink, '邀请链接已复制')}>
              复制链接
            </Button>
          </Flexbox>
        </Flexbox>
      </Card>

      <Card size="small" title="奖励规则">
        {data?.policy?.enabled === false ? (
          <Empty description="推荐奖励暂未开启" />
        ) : (
          <Flexbox gap={8}>
            {Number(data?.policy?.registrationCredits) > 0 && (
              <div>
                <Tag color="green">注册奖励</Tag>
                好友通过你的邀请注册后，你将获得{' '}
                <strong>{data?.policy?.registrationCredits} 积分</strong>
              </div>
            )}
            {Number(data?.policy?.inviteeRegistrationCredits) > 0 && (
              <div>
                <Tag color="cyan">新用户奖励</Tag>
                好友通过邀请注册，新用户获得{' '}
                <strong>{data?.policy?.inviteeRegistrationCredits} 积分</strong>
              </div>
            )}
            {tiers
              .slice()
              .sort((a, b) => b.minAmount - a.minAmount)
              .map((t) => (
                <div key={`${t.minAmount}-${t.rate}`}>
                  好友单笔消费 ≥ ¥{t.minAmount}，返利{' '}
                  <strong>{(Number(t.rate) * 100).toFixed(0)}%</strong>
                  <span style={{ marginLeft: 8, opacity: 0.6 }}>
                    （例：消费 ¥100 → 你得 {Math.floor(100 * Number(t.rate) * 100)} 积分）
                  </span>
                </div>
              ))}
            {tiers.length === 0 && !Number(data?.policy?.registrationCredits) && !Number(data?.policy?.inviteeRegistrationCredits) && (
              <Empty description="暂无奖励档位" />
            )}
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              积分按 ¥1 = 100 积分折算；好友通过你的邀请链接注册并支付成功后自动到账。政策由平台配置。
            </div>
          </Flexbox>
        )}
      </Card>


      <Card size="small" title="奖励记录">
        <Table
          columns={rewardColumns as any}
          dataSource={data?.rewards || []}
          loading={isLoading}
          locale={{ emptyText: <Empty description="暂无奖励" /> }}
          pagination={{ pageSize: 10 }}
          rowKey="id"
          size="small"
        />
      </Card>
    </Flexbox>
  );
};

export default ReferralPage;
