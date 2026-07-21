'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, Modal, Select } from '@lobehub/ui/base-ui';
import { App, DatePicker, Form, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useMemo, useState } from 'react';
import { Link } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminSubscriptionsPage: FC = () => {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [renewModalData, setRenewModalData] = useState<{
    expiresAt: Date | null;
    id: string;
  } | null>(null);
  const [form] = Form.useForm();
  const [renewForm] = Form.useForm();
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

  const userOptions = useMemo(
    () =>
      (usersData?.users ?? []).map((u) => ({
        label: u.email || u.username || u.id,
        value: u.id,
      })),
    [usersData?.users],
  );

  const planOptions = useMemo(
    () =>
      (plansData?.plans ?? [])
        .filter((p) => p.active)
        .map((p) => ({
          label: `${p.displayName} (¥${p.price}/${
            p.billingCycle === 'monthly' ? '月' : p.billingCycle === 'yearly' ? '年' : '终身'
          })`,
          value: p.id,
        })),
    [plansData?.plans],
  );

  const handleAssign = async (values: any) => {
    try {
      await lambdaClient.admin.assignSubscription.mutate({
        expiresAt: values.expiresAt ? dayjs(values.expiresAt).toISOString() : null,
        notes: values.notes,
        planId: values.planId,
        userId: values.userId,
      });
      message.success('订阅已分配');
      setAssignModalOpen(false);
      form.resetFields();
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  const handleCancel = async (id: string) => {
    modal.confirm({
      content: '取消此订阅？用户将在到期后失去访问权限。',
      onOk: async () => {
        try {
          await lambdaClient.admin.cancelSubscription.mutate({ id });
          message.success('订阅已取消');
          mutate();
        } catch (e: any) {
          message.error(e?.message ?? '操作失败');
        }
      },
      title: '取消订阅',
    });
  };

  const handleRenew = async () => {
    if (!renewModalData) return;
    try {
      const values = await renewForm.validateFields();
      await lambdaClient.admin.renewSubscription.mutate({
        expiresAt: dayjs(values.newExpiresAt).toISOString(),
        id: renewModalData.id,
      });
      message.success('订阅已续期');
      setRenewModalData(null);
      renewForm.resetFields();
      mutate();
    } catch (e: any) {
      if (e?.errorFields) return; // form validation error
      message.error(e?.message ?? '操作失败');
    }
  };

  const columns = [
    {
      dataIndex: ['user', 'email'],
      key: 'user',
      render: (email: string, row: any) => (
        <Link to={`/admin/users/${row.userId}`}>{email || row.user.username || row.userId}</Link>
      ),
      title: '用户',
    },
    {
      dataIndex: ['plan', 'displayName'],
      key: 'plan',
      title: '套餐',
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
        const text =
          status === 'active'
            ? '激活'
            : status === 'cancelled'
              ? '已取消'
              : status === 'expired'
                ? '已过期'
                : '试用';
        return <Tag color={color}>{text}</Tag>;
      },
      title: '状态',
    },
    {
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
      title: '开始日期',
    },
    {
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (date: string | null) => {
        if (!date) return '终身';
        const d = dayjs(date);
        const daysLeft = d.diff(dayjs(), 'day');
        return (
          <span>
            {d.format('YYYY-MM-DD')}
            {daysLeft >= 0 && daysLeft <= 30 && (
              <Tag color="orange" style={{ marginLeft: 8 }}>
                剩余{daysLeft}天
              </Tag>
            )}
          </span>
        );
      },
      title: '到期日期',
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Flexbox horizontal gap={8}>
          {row.status === 'active' && (
            <>
              <Button
                size="small"
                onClick={() => {
                  setRenewModalData({ expiresAt: row.expiresAt, id: row.id });
                  renewForm.setFieldsValue({
                    newExpiresAt: row.expiresAt ? dayjs(row.expiresAt) : undefined,
                  });
                }}
              >
                续期
              </Button>
              <Button danger size="small" onClick={() => handleCancel(row.id)}>
                取消
              </Button>
            </>
          )}
        </Flexbox>
      ),
      title: '操作',
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox horizontal gap={12}>
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 200 }}
          value={statusFilter}
          options={[
            { label: '激活', value: 'active' },
            { label: '已取消', value: 'cancelled' },
            { label: '已过期', value: 'expired' },
            { label: '试用', value: 'trial' },
          ]}
          onChange={(val) => {
            setStatusFilter((val as string | null) ?? undefined);
            setPage(1);
          }}
        />
        <Button type="primary" onClick={() => setAssignModalOpen(true)}>
          分配订阅
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

      <Modal
        open={assignModalOpen}
        title="分配订阅"
        onOk={() => form.submit()}
        onCancel={() => {
          setAssignModalOpen(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleAssign}>
          <Form.Item label="用户" name="userId" rules={[{ message: '必填', required: true }]}>
            <Select showSearch options={userOptions} placeholder="选择用户" />
          </Form.Item>

          <Form.Item label="套餐" name="planId" rules={[{ message: '必填', required: true }]}>
            <Select options={planOptions} placeholder="选择套餐" />
          </Form.Item>

          <Form.Item label="到期日期" name="expiresAt" tooltip="留空表示终身有效">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="备注" name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!renewModalData}
        title="续期订阅"
        onOk={handleRenew}
        onCancel={() => {
          setRenewModalData(null);
          renewForm.resetFields();
        }}
      >
        <Form form={renewForm} layout="vertical">
          <Form.Item
            label="新到期日期"
            name="newExpiresAt"
            rules={[{ message: '必填', required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Flexbox>
  );
};

export default AdminSubscriptionsPage;
