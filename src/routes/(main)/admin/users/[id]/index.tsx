'use client';

import { Flexbox } from '@lobehub/ui';
import { Descriptions, Tag } from 'antd';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { lambdaClient } from '@/libs/trpc/client';

const AdminUserDetailPage: FC = () => {
  const { t } = useTranslation('common');
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useSWR(id ? ['admin-user', id] : null, () =>
    lambdaClient.admin.getUserDetail.query({ userId: id! }),
  );

  if (isLoading || !data) return <Loading debugId="AdminUserDetail" />;

  return (
    <Flexbox padding={24}>
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
    </Flexbox>
  );
};

export default AdminUserDetailPage;
