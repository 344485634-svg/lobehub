'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { App, Switch, Table, Tag } from 'antd';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminPlansPage: FC = () => {
  const { t } = useTranslation('common');
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(['admin-plans', page, search], () =>
    lambdaClient.admin.listPlans.query({ page, pageSize, search: search || undefined }),
  );

  const handleDelete = async (id: string, name: string) => {
    modal.confirm({
      content: t('admin.confirmDeletePlan', {
        defaultValue: `Delete plan "${name}"? Users with active subscriptions will be unaffected.`,
        name,
      }),
      onOk: async () => {
        try {
          await lambdaClient.admin.deletePlan.mutate({ id });
          message.success(t('admin.planDeleted', { defaultValue: 'Plan deleted' }));
          mutate();
        } catch (e: any) {
          message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
        }
      },
      title: t('admin.deletePlan', { defaultValue: 'Delete Plan' }),
    });
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await lambdaClient.admin.updatePlan.mutate({ active: !currentActive, id });
      message.success(
        t('admin.planUpdated', { defaultValue: currentActive ? 'Plan disabled' : 'Plan enabled' }),
      );
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
    }
  };

  const columns = [
    {
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: any) => (
        <Link to={`/admin/plans/${row.id}/edit`}>
          <strong>{name}</strong>
        </Link>
      ),
      title: t('admin.planName', { defaultValue: 'Plan Name' }),
    },
    {
      dataIndex: 'displayName',
      key: 'displayName',
      title: t('admin.displayName', { defaultValue: 'Display Name' }),
    },
    {
      dataIndex: 'price',
      key: 'price',
      render: (price: string, row: any) => {
        const cycle =
          row.billingCycle === 'monthly'
            ? '/mo'
            : row.billingCycle === 'yearly'
              ? '/yr'
              : ' (lifetime)';
        return `¥${price}${cycle}`;
      },
      title: t('admin.price', { defaultValue: 'Price' }),
    },
    {
      dataIndex: 'billingCycle',
      key: 'billingCycle',
      render: (cycle: string) => (
        <Tag>
          {cycle === 'monthly'
            ? t('admin.monthly', { defaultValue: 'Monthly' })
            : cycle === 'yearly'
              ? t('admin.yearly', { defaultValue: 'Yearly' })
              : t('admin.lifetime', { defaultValue: 'Lifetime' })}
        </Tag>
      ),
      title: t('admin.billingCycle', { defaultValue: 'Billing Cycle' }),
    },
    {
      dataIndex: 'quotas',
      key: 'quotas',
      render: (quotas: Record<string, number>) => {
        const entries = Object.entries(quotas || {}).slice(0, 3);
        if (entries.length === 0) return '-';
        return (
          <span style={{ fontSize: 12 }}>
            {entries.map(([k, v]) => `${k}: ${v}`).join(', ')}
            {Object.keys(quotas).length > 3 && '...'}
          </span>
        );
      },
      title: t('admin.quotas', { defaultValue: 'Quotas' }),
      width: 200,
    },
    {
      dataIndex: 'active',
      key: 'active',
      render: (active: boolean, row: any) => (
        <Switch checked={active} size="small" onChange={() => handleToggleActive(row.id, active)} />
      ),
      title: t('admin.active', { defaultValue: 'Active' }),
    },
    {
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      title: t('admin.sortOrder', { defaultValue: 'Sort' }),
      width: 80,
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Flexbox horizontal gap={8}>
          <Link to={`/admin/plans/${row.id}/edit`}>
            <Button size="small">{t('admin.edit', { defaultValue: 'Edit' })}</Button>
          </Link>
          <Button danger size="small" onClick={() => handleDelete(row.id, row.name)}>
            {t('admin.delete', { defaultValue: 'Delete' })}
          </Button>
        </Flexbox>
      ),
      title: t('admin.actions', { defaultValue: 'Actions' }),
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox horizontal gap={12}>
        <Input
          placeholder={t('admin.searchPlans', {
            defaultValue: 'Search plans by name or description',
          })}
          style={{ maxWidth: 320 }}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Link to="/admin/plans/create">
          <Button type="primary">{t('admin.createPlan', { defaultValue: 'Create Plan' })}</Button>
        </Link>
      </Flexbox>
      <Table
        columns={columns}
        dataSource={data?.plans ?? []}
        loading={isLoading}
        rowKey="id"
        pagination={{
          current: page,
          onChange: setPage,
          pageSize,
          total: data?.total ?? 0,
        }}
      />
    </Flexbox>
  );
};

export default AdminPlansPage;
