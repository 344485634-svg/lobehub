'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, Select } from '@lobehub/ui/base-ui';
import { App, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminSkillsPage: FC = () => {
  const { t } = useTranslation('common');
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'builtin' | 'market' | 'user' | undefined>(
    undefined,
  );
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(
    ['admin-skills', page, search, userIdFilter, sourceFilter],
    () =>
      lambdaClient.admin.listAllSkills.query({
        page,
        pageSize,
        search: search || undefined,
        source: sourceFilter,
        userId: userIdFilter || undefined,
      }),
  );

  const deleteSkill = async (id: string, name: string) => {
    modal.confirm({
      content: t('admin.confirmDeleteSkill', {
        defaultValue: `Delete skill "${name}"? This cannot be undone.`,
        name,
      }),
      onOk: async () => {
        try {
          const res = await lambdaClient.admin.deleteSkill.mutate({ id });
          if (res.success) {
            message.success(t('admin.skillDeleted', { defaultValue: 'Skill deleted' }));
            mutate();
          } else {
            message.warning(t('admin.skillNotFound', { defaultValue: 'Skill not found' }));
          }
        } catch (e: any) {
          message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
        }
      },
    });
  };

  const columns = [
    {
      dataIndex: 'name',
      key: 'name',
      title: t('admin.name', { defaultValue: 'Name' }),
    },
    {
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => (
        <span style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
          {desc?.slice(0, 60)}
          {desc?.length > 60 ? '…' : ''}
        </span>
      ),
      title: t('admin.description', { defaultValue: 'Description' }),
    },
    {
      dataIndex: 'source',
      key: 'source',
      render: (source: string) => {
        const color = source === 'builtin' ? 'blue' : source === 'market' ? 'green' : 'default';
        return <Tag color={color}>{source}</Tag>;
      },
      title: t('admin.source', { defaultValue: 'Source' }),
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
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => dayjs(createdAt).format('YYYY-MM-DD'),
      title: t('admin.createdAt', { defaultValue: 'Created' }),
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Button danger size="small" onClick={() => deleteSkill(row.id, row.name)}>
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
          placeholder={t('admin.searchSkills', { defaultValue: 'Search by name or description' })}
          style={{ maxWidth: 280 }}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Input
          placeholder={t('admin.filterByUserId', { defaultValue: 'Filter by user ID' })}
          style={{ maxWidth: 200 }}
          value={userIdFilter}
          onChange={(e) => {
            setPage(1);
            setUserIdFilter(e.target.value);
          }}
        />
        <Select
          placeholder={t('admin.filterBySource', { defaultValue: 'Source' })}
          style={{ width: 120 }}
          value={sourceFilter}
          options={[
            { label: t('admin.allSources', { defaultValue: 'All' }), value: undefined },
            { label: 'Builtin', value: 'builtin' },
            { label: 'Market', value: 'market' },
            { label: 'User', value: 'user' },
          ]}
          onChange={(val) => {
            setPage(1);
            setSourceFilter(val);
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

export default AdminSkillsPage;
