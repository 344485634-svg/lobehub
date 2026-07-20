'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { App, Table, Tag } from 'antd';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminUsersPage: FC = () => {
  const { t } = useTranslation('common');
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(['admin-users', page, search], () =>
    lambdaClient.admin.listUsers.query({ page, pageSize, search: search || undefined }),
  );

  const ban = async (userId: string) => {
    const reason = window.prompt(t('admin.banReasonPrompt', { defaultValue: 'Ban reason:' }));
    if (reason === null) return;
    try {
      await lambdaClient.admin.banUser.mutate({ reason: reason || 'N/A', userId });
      message.success(t('admin.banned', { defaultValue: 'User banned' }));
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
    }
  };

  const unban = async (userId: string) => {
    try {
      await lambdaClient.admin.unbanUser.mutate({ userId });
      message.success(t('admin.unbanned', { defaultValue: 'User unbanned' }));
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
    }
  };

  const toggleRole = async (userId: string, current: string | null) => {
    const role = current === 'admin' ? 'user' : 'admin';
    modal.confirm({
      content: t('admin.confirmRole', { defaultValue: `Set role to ${role}?`, role }),
      onOk: async () => {
        try {
          await lambdaClient.admin.updateUserRole.mutate({ role, userId });
          message.success(t('admin.roleUpdated', { defaultValue: 'Role updated' }));
          mutate();
        } catch (e: any) {
          message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
        }
      },
    });
  };

  const columns = [
    {
      dataIndex: 'email',
      key: 'email',
      render: (email: string, row: any) => (
        <Link to={`/admin/users/${row.id}`}>{email || row.username || row.id}</Link>
      ),
      title: t('admin.email', { defaultValue: 'Email' }),
    },
    {
      dataIndex: 'role',
      key: 'role',
      render: (role: string | null) => (
        <Tag color={role === 'admin' ? 'gold' : 'default'}>{role || 'user'}</Tag>
      ),
      title: t('admin.role', { defaultValue: 'Role' }),
    },
    {
      dataIndex: 'banned',
      key: 'banned',
      render: (banned: boolean | null) =>
        banned ? <Tag color="red">{t('admin.bannedTag', { defaultValue: 'Banned' })}</Tag> : null,
      title: t('admin.status', { defaultValue: 'Status' }),
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Flexbox horizontal gap={8}>
          {row.banned ? (
            <Button size="small" onClick={() => unban(row.id)}>
              {t('admin.unban', { defaultValue: 'Unban' })}
            </Button>
          ) : (
            <Button danger size="small" onClick={() => ban(row.id)}>
              {t('admin.ban', { defaultValue: 'Ban' })}
            </Button>
          )}
          <Button size="small" onClick={() => toggleRole(row.id, row.role)}>
            {row.role === 'admin'
              ? t('admin.demote', { defaultValue: 'Demote' })
              : t('admin.promote', { defaultValue: 'Promote' })}
          </Button>
        </Flexbox>
      ),
      title: t('admin.actions', { defaultValue: 'Actions' }),
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Input
        placeholder={t('admin.searchPlaceholder', { defaultValue: 'Search email or username' })}
        style={{ maxWidth: 320 }}
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
      />
      <Table
        columns={columns}
        dataSource={data?.users ?? []}
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

export default AdminUsersPage;
