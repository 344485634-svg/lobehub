'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, Modal, Select } from '@lobehub/ui/base-ui';
import { App, DatePicker, Form, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminSubscriptionsPage: FC = () => {
  const { t } = useTranslation('common');
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [renewModalData, setRenewModalData] = useState<{
    expiresAt: Date | null;
    id: string;
  } | null>(null);
  const [form] = Form.useForm();
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(['admin-subscriptions', page, statusFilter], () =>
    lambdaClient.admin.listSubscriptions.query({
      page,
      pageSize,
      status: statusFilter as any,
    }),
  );

  const { data: plansData } = useSWR('admin-plans-all', () =>
    lambdaClient.admin.listPlans.query({ page: 1, pageSize: 100 }),
  );

  const { data: usersData } = useSWR('admin-users-all', () =>
    lambdaClient.admin.listUsers.query({ page: 1, pageSize: 100 }),
  );

  const handleAssign = async (values: any) => {
    try {
      await lambdaClient.admin.assignSubscription.mutate({
        expiresAt: values.expiresAt ? dayjs(values.expiresAt).toISOString() : null,
        notes: values.notes,
        planId: values.planId,
        userId: values.userId,
      });
      message.success(t('admin.subscriptionAssigned', { defaultValue: 'Subscription assigned' }));
      setAssignModalOpen(false);
      form.resetFields();
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
    }
  };

  const handleCancel = async (id: string) => {
    modal.confirm({
      content: t('admin.confirmCancelSubscription', {
        defaultValue: 'Cancel this subscription? User will lose access after expiry.',
      }),
      onOk: async () => {
        try {
          await lambdaClient.admin.cancelSubscription.mutate({ id });
          message.success(
            t('admin.subscriptionCancelled', { defaultValue: 'Subscription cancelled' }),
          );
          mutate();
        } catch (e: any) {
          message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
        }
      },
      title: t('admin.cancelSubscription', { defaultValue: 'Cancel Subscription' }),
    });
  };

  const handleRenew = async () => {
    if (!renewModalData) return;
    try {
      const values = await form.validateFields();
      await lambdaClient.admin.renewSubscription.mutate({
        expiresAt: dayjs(values.newExpiresAt).toISOString(),
        id: renewModalData.id,
      });
      message.success(t('admin.subscriptionRenewed', { defaultValue: 'Subscription renewed' }));
      setRenewModalData(null);
      form.resetFields();
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
    }
  };

  const columns = [
    {
      dataIndex: ['user', 'email'],
      key: 'user',
      render: (email: string, row: any) => (
        <Link to={`/admin/users/${row.userId}`}>{email || row.user.username || row.userId}</Link>
      ),
      title: t('admin.user', { defaultValue: 'User' }),
    },
    {
      dataIndex: ['plan', 'displayName'],
      key: 'plan',
      title: t('admin.plan', { defaultValue: 'Plan' }),
    },
    {
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color =
          status === 'active'
            ? 'green'
            : status === 'cancelled'
              ? 'orange'
              : status === 'expired'
                ? 'red'
                : 'blue';
        return <Tag color={color}>{status}</Tag>;
      },
      title: t('admin.status', { defaultValue: 'Status' }),
    },
    {
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
      title: t('admin.startedAt', { defaultValue: 'Started' }),
    },
    {
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (date: string | null) => {
        if (!date) return t('admin.lifetime', { defaultValue: 'Lifetime' });
        const d = dayjs(date);
        const daysLeft = d.diff(dayjs(), 'day');
        return (
          <span>
            {d.format('YYYY-MM-DD')}
            {daysLeft >= 0 && daysLeft <= 30 && (
              <Tag color="orange" style={{ marginLeft: 8 }}>
                {daysLeft}d left
              </Tag>
            )}
          </span>
        );
      },
      title: t('admin.expiresAt', { defaultValue: 'Expires' }),
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Flexbox horizontal gap={8}>
          {row.status === 'active' && (
            <>
              <Button
                size="small"
                onClick={() => setRenewModalData({ expiresAt: row.expiresAt, id: row.id })}
              >
                {t('admin.renew', { defaultValue: 'Renew' })}
              </Button>
              <Button danger size="small" onClick={() => handleCancel(row.id)}>
                {t('admin.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </>
          )}
        </Flexbox>
      ),
      title: t('admin.actions', { defaultValue: 'Actions' }),
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox horizontal gap={12}>
        <Select
          allowClear
          placeholder={t('admin.filterByStatus', { defaultValue: 'Filter by status' })}
          style={{ width: 200 }}
          value={statusFilter}
          onChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
        >
          <Select.Option value="active">
            {t('admin.active', { defaultValue: 'Active' })}
          </Select.Option>
          <Select.Option value="cancelled">
            {t('admin.cancelled', { defaultValue: 'Cancelled' })}
          </Select.Option>
          <Select.Option value="expired">
            {t('admin.expired', { defaultValue: 'Expired' })}
          </Select.Option>
          <Select.Option value="trial">{t('admin.trial', { defaultValue: 'Trial' })}</Select.Option>
        </Select>
        <Button type="primary" onClick={() => setAssignModalOpen(true)}>
          {t('admin.assignSubscription', { defaultValue: 'Assign Subscription' })}
        </Button>
      </Flexbox>

      <Table
        columns={columns}
        dataSource={data?.subscriptions ?? []}
        loading={isLoading}
        rowKey="id"
        pagination={{
          current: page,
          onChange: setPage,
          pageSize,
          total: data?.total ?? 0,
        }}
      />

      {/* Assign Subscription Modal */}
      <Modal
        open={assignModalOpen}
        title={t('admin.assignSubscription', { defaultValue: 'Assign Subscription' })}
        onOk={() => form.submit()}
        onCancel={() => {
          setAssignModalOpen(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleAssign}>
          <Form.Item
            label={t('admin.user', { defaultValue: 'User' })}
            name="userId"
            rules={[{ message: 'Required', required: true }]}
          >
            <Select
              showSearch
              placeholder={t('admin.selectUser', { defaultValue: 'Select user' })}
              filterOption={(input, option) =>
                (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {usersData?.users.map((u) => (
                <Select.Option key={u.id} value={u.id}>
                  {u.email || u.username || u.id}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label={t('admin.plan', { defaultValue: 'Plan' })}
            name="planId"
            rules={[{ message: 'Required', required: true }]}
          >
            <Select placeholder={t('admin.selectPlan', { defaultValue: 'Select plan' })}>
              {plansData?.plans
                .filter((p) => p.active)
                .map((p) => (
                  <Select.Option key={p.id} value={p.id}>
                    {p.displayName} (¥{p.price}/{p.billingCycle})
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            label={t('admin.expiresAt', { defaultValue: 'Expires At' })}
            name="expiresAt"
            tooltip={t('admin.leaveEmptyForLifetime', { defaultValue: 'Leave empty for lifetime' })}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label={t('admin.notes', { defaultValue: 'Notes' })} name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Renew Subscription Modal */}
      <Modal
        open={!!renewModalData}
        title={t('admin.renewSubscription', { defaultValue: 'Renew Subscription' })}
        onOk={handleRenew}
        onCancel={() => {
          setRenewModalData(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            initialValue={renewModalData?.expiresAt ? dayjs(renewModalData.expiresAt) : undefined}
            label={t('admin.newExpiresAt', { defaultValue: 'New Expiry Date' })}
            name="newExpiresAt"
            rules={[{ message: 'Required', required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Flexbox>
  );
};

export default AdminSubscriptionsPage;
