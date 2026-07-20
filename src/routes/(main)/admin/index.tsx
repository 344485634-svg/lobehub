'use client';

import { Flexbox } from '@lobehub/ui';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import StatisticCard from '@/components/StatisticCard';
import { lambdaClient } from '@/libs/trpc/client';

const AdminDashboard: FC = () => {
  const { t } = useTranslation('common');
  const { data, isLoading } = useSWR('admin-stats-total', () =>
    lambdaClient.admin.listUsers.query({ page: 1, pageSize: 1 }),
  );
  const { data: banned } = useSWR('admin-stats-banned', () =>
    lambdaClient.admin.listUsers.query({ bannedOnly: true, page: 1, pageSize: 1 }),
  );

  if (isLoading) return <Loading debugId="AdminDashboard" />;

  return (
    <Flexbox horizontal gap={16} padding={24} wrap="wrap">
      <StatisticCard
        statistic={{ value: data?.total ?? 0 }}
        title={t('admin.totalUsers', { defaultValue: 'Total users' })}
      />
      <StatisticCard
        statistic={{ value: banned?.total ?? 0 }}
        title={t('admin.bannedUsers', { defaultValue: 'Banned users' })}
      />
    </Flexbox>
  );
};

export default AdminDashboard;
