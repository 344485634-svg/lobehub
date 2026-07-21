'use client';

import { Flexbox } from '@lobehub/ui';
import { Card, Descriptions, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { useParams } from 'react-router';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { lambdaClient } from '@/libs/trpc/client';

const AdminUserDetailPage: FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useSWR(id ? ['admin-user', id] : null, () =>
    lambdaClient.admin.getUserDetail.query({ userId: id! }),
  );

  const { data: subscriptions } = useSWR(id ? ['admin-user-subscriptions', id] : null, () =>
    lambdaClient.admin.listSubscriptions.query({ pageSize: 10, userId: id! }),
  );

  if (isLoading) return <Loading debugId="AdminUserDetail" />;
  if (error || !data) return <Flexbox padding={24}>{error?.message ?? '用户未找到'}</Flexbox>;

  return (
    <Flexbox gap={16} padding={24}>
      <Card title="用户信息">
        <Descriptions bordered column={1} title={data.email || data.username || data.id}>
          <Descriptions.Item label="邮箱">{data.email}</Descriptions.Item>
          <Descriptions.Item label="用户名">{data.username}</Descriptions.Item>
          <Descriptions.Item label="角色">
            <Tag color={data.role === 'admin' ? 'gold' : 'default'}>{data.role || 'user'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="邮箱验证">{data.emailVerified ? '✓' : '✗'}</Descriptions.Item>
          <Descriptions.Item label="状态">
            {data.banned ? <Tag color="red">{data.banReason || '已封禁'}</Tag> : '正常'}
          </Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {new Date(data.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="最后活跃">
            {new Date(data.lastActiveAt).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="订阅信息">
        {subscriptions?.subscriptions && subscriptions.subscriptions.length > 0 ? (
          <Descriptions bordered column={1}>
            {subscriptions.subscriptions.map((sub) => {
              const statusText =
                sub.status === 'active'
                  ? '激活'
                  : sub.status === 'cancelled'
                    ? '已取消'
                    : sub.status === 'expired'
                      ? '已过期'
                      : '试用';
              return (
                <Descriptions.Item key={sub.id} label={`${sub.plan.displayName} (${statusText})`}>
                  <Flexbox gap={8}>
                    <div>开始日期：{dayjs(sub.startedAt).format('YYYY-MM-DD')}</div>
                    <div>
                      到期日期：{sub.expiresAt ? dayjs(sub.expiresAt).format('YYYY-MM-DD') : '终身'}
                    </div>
                    {sub.notes && (
                      <div style={{ color: '#666', fontSize: 12 }}>备注：{sub.notes}</div>
                    )}
                  </Flexbox>
                </Descriptions.Item>
              );
            })}
          </Descriptions>
        ) : (
          <div style={{ color: '#999', padding: 16 }}>无订阅</div>
        )}
      </Card>
    </Flexbox>
  );
};

export default AdminUserDetailPage;
