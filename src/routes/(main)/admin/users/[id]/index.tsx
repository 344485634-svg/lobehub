'use client';

import { Flexbox } from '@lobehub/ui';
import { Card, Descriptions, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { lambdaClient } from '@/libs/trpc/client';

const AdminUserDetailPage: FC = () => {
  const { t } = useTranslation('common');
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useSWR(id ? ['admin-user', id] : null, () =>
    lambdaClient.admin.getUserDetail.query({ userId: id! }),
  );

  const { data: subscriptions } = useSWR(id ? ['admin-user-subscriptions', id] : null, () =>
    lambdaClient.admin.listSubscriptions.query({ pageSize: 10, userId: id! }),
  );

  if (isLoading) return <Loading debugId="AdminUserDetail" />;
  if (error || !data)
    return (
      <Flexbox padding={24}>
        {error?.message ?? t('admin.userNotFound', { defaultValue: 'User not found' })}
      </Flexbox>
    );

  return (
    <Flexbox gap={16} padding={24}>
      <Card title={t('admin.userInfo', { defaultValue: 'User Information' })}>
        <Descriptions bordered column={1} title={data.email || data.username || data.id}>
          <Descriptions.Item label={t('admin.email', { defaultValue: 'Email' })}>
            {data.email}
          </Descriptions.Item>
          <Descriptions.Item label={t('admin.username', { defaultValue: 'Username' })}>
            {data.username}
          </Descriptions.Item>
          <Descriptions.Item label={t('admin.role', { defaultValue: 'Role' })}>
            <Tag color={data.role === 'admin' ? 'gold' : 'default'}>{data.role || 'user'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('admin.emailVerified', { defaultValue: 'Email verified' })}>
            {data.emailVerified ? '✓' : '✗'}
          </Descriptions.Item>
          <Descriptions.Item label={t('admin.status', { defaultValue: 'Status' })}>
            {data.banned ? (
              <Tag color="red">{data.banReason || 'Banned'}</Tag>
            ) : (
              t('admin.active', { defaultValue: 'Active' })
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('admin.createdAt', { defaultValue: 'Registered' })}>
            {new Date(data.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label={t('admin.lastActive', { defaultValue: 'Last active' })}>
            {new Date(data.lastActiveAt).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={t('admin.subscription', { defaultValue: 'Subscription' })}>
        {subscriptions?.subscriptions && subscriptions.subscriptions.length > 0 ? (
          <Descriptions bordered column={1}>
            {subscriptions.subscriptions.map((sub) => (
              <Descriptions.Item key={sub.id} label={`${sub.plan.displayName} (${sub.status})`}>
                <Flexbox gap={8}>
                  <div>
                    {t('admin.started', { defaultValue: 'Started' })}:{' '}
                    {dayjs(sub.startedAt).format('YYYY-MM-DD')}
                  </div>
                  <div>
                    {t('admin.expires', { defaultValue: 'Expires' })}:{' '}
                    {sub.expiresAt
                      ? dayjs(sub.expiresAt).format('YYYY-MM-DD')
                      : t('admin.lifetime', { defaultValue: 'Lifetime' })}
                  </div>
                  {sub.notes && (
                    <div style={{ color: '#666', fontSize: 12 }}>
                      {t('admin.notes', { defaultValue: 'Notes' })}: {sub.notes}
                    </div>
                  )}
                </Flexbox>
              </Descriptions.Item>
            ))}
          </Descriptions>
        ) : (
          <div style={{ color: '#999', padding: 16 }}>
            {t('admin.noSubscription', { defaultValue: 'No subscription' })}
          </div>
        )}
      </Card>
    </Flexbox>
  );
};

export default AdminUserDetailPage;
