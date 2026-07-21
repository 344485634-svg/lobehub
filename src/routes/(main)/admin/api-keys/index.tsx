'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, Switch } from '@lobehub/ui/base-ui';
import { App, Table } from 'antd';
import dayjs from 'dayjs';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminApiKeysPage: FC = () => {
  const { t } = useTranslation('common');
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(['admin-api-keys', page, search, userIdFilter], () =>
    lambdaClient.admin.listAllApiKeys.query({
      page,
      pageSize,
      search: search || undefined,
      userId: userIdFilter || undefined,
    }),
  );

  const deleteKey = async (id: string, name: string) => {
    modal.confirm({
      content: t('admin.confirmDeleteApiKey', {
        defaultValue: `Delete API key "${name}"? This cannot be undone.`,
        name,
      }),
      onOk: async () => {
        try {
          await lambdaClient.admin.deleteApiKey.mutate({ id });
          message.success(t('admin.apiKeyDeleted', { defaultValue: 'API key deleted' }));
          mutate();
        } catch (e: any) {
          message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
        }
      },
    });
  };

  const toggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      await lambdaClient.admin.updateApiKey.mutate({ id, value: { enabled: !currentEnabled } });
      message.success(t('admin.apiKeyUpdated', { defaultValue: 'API key updated' }));
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
    }
  };

  const columns = [
    {
      dataIndex: 'name',
      key: 'name',
      title: t('admin.name', { defaultValue: 'Name' }),
    },
    {
      dataIndex: 'userId',
      key: 'userId',
      render: (userId: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{userId}</span>
      ),
      title: t('admin.userId', { defaultValue: 'User ID' }),
    },
    {
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, row: any) => (
        <Switch checked={enabled} size="small" onChange={() => toggleEnabled(row.id, enabled)} />
      ),
      title: t('admin.enabled', { defaultValue: 'Enabled' }),
    },
    {
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (expiresAt: string | null) =>
        expiresAt ? dayjs(expiresAt).format('YYYY-MM-DD') : '—',
      title: t('admin.expiresAt', { defaultValue: 'Expires' }),
    },
    {
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      render: (lastUsedAt: string | null) =>
        lastUsedAt ? dayjs(lastUsedAt).fromNow() : t('admin.never', { defaultValue: 'Never' }),
      title: t('admin.lastUsed', { defaultValue: 'Last used' }),
    },
    {
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => dayjs(createdAt).format('YYYY-MM-DD'),
      title: t('admin.createdAt', { defaultValue: 'Created' }),
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Button danger size="small" onClick={() => deleteKey(row.id, row.name)}>
          {t('admin.delete', { defaultValue: 'Delete' })}
        </Button>
      ),
      title: t('admin.actions', { defaultValue: 'Actions' }),
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox horizontal gap={8}>
        <Input
          placeholder={t('admin.searchApiKeys', { defaultValue: 'Search by name' })}
          style={{ maxWidth: 240 }}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Input
          placeholder={t('admin.filterByUserId', { defaultValue: 'Filter by user ID' })}
          style={{ maxWidth: 240 }}
          value={userIdFilter}
          onChange={(e) => {
            setPage(1);
            setUserIdFilter(e.target.value);
          }}
        />
      </Flexbox>
      <Table
        columns={columns}
        dataSource={data?.data ?? []}
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

export default AdminApiKeysPage;
