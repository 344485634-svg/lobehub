'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Modal, Select } from '@lobehub/ui/base-ui';
import { App, Form, Input, InputNumber, Switch, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useMemo, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminCouponsPage: FC = () => {
  const { message, modal } = App.useApp();
  const { data, isLoading, mutate } = useSWR('admin-coupons', () =>
    lambdaClient.admin.listCoupons.query(),
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      active: true,
      perUserLimit: 1,
      scope: 'all',
      type: 'percent',
      value: 10,
    });
    setOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    form.setFieldsValue({
      active: row.active,
      code: row.code,
      description: row.description,
      endsAt: row.endsAt ? dayjs(row.endsAt).format('YYYY-MM-DDTHH:mm') : undefined,
      maxDiscount: row.maxDiscount != null ? Number(row.maxDiscount) : undefined,
      minAmount: row.minAmount != null ? Number(row.minAmount) : undefined,
      name: row.name,
      perUserLimit: row.perUserLimit,
      scope: row.scope,
      startsAt: row.startsAt ? dayjs(row.startsAt).format('YYYY-MM-DDTHH:mm') : undefined,
      totalLimit: row.totalLimit,
      type: row.type,
      value: Number(row.value),
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const toIso = (v?: string) => (v ? new Date(v).toISOString() : null);
      if (editing) {
        await lambdaClient.admin.updateCoupon.mutate({
          active: values.active,
          description: values.description,
          endsAt: toIso(values.endsAt),
          id: editing.id,
          maxDiscount: values.maxDiscount ?? null,
          minAmount: values.minAmount ?? null,
          name: values.name,
          perUserLimit: values.perUserLimit ?? null,
          scope: values.scope,
          startsAt: toIso(values.startsAt),
          totalLimit: values.totalLimit ?? null,
          type: values.type,
          value: values.value,
        });
        message.success('已更新');
      } else {
        await lambdaClient.admin.createCoupon.mutate({
          active: values.active,
          code: values.code,
          description: values.description,
          endsAt: toIso(values.endsAt) || undefined,
          maxDiscount: values.maxDiscount,
          minAmount: values.minAmount,
          name: values.name,
          perUserLimit: values.perUserLimit,
          scope: values.scope,
          startsAt: toIso(values.startsAt) || undefined,
          totalLimit: values.totalLimit,
          type: values.type,
          value: values.value,
        });
        message.success('已创建');
      }
      setOpen(false);
      mutate();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (row: any) => {
    modal.confirm({
      content: `确定删除优惠码 ${row.code}？`,
      onOk: async () => {
        await lambdaClient.admin.deleteCoupon.mutate({ id: row.id });
        message.success('已删除');
        mutate();
      },
      title: '删除优惠券',
    });
  };

  const columns = useMemo(
    () => [
      {
        dataIndex: 'code',
        key: 'code',
        render: (c: string) => <Tag color="blue">{c}</Tag>,
        title: '优惠码',
        width: 120,
      },
      { dataIndex: 'name', key: 'name', title: '名称' },
      {
        key: 'type',
        render: (_: unknown, r: any) =>
          r.type === 'percent' ? `${r.value}% 折扣` : `减 ¥${r.value}`,
        title: '优惠',
        width: 120,
      },
      {
        dataIndex: 'scope',
        key: 'scope',
        render: (s: string) =>
          s === 'subscription' ? '仅套餐' : s === 'topup' ? '仅充值' : '全部',
        title: '适用范围',
        width: 90,
      },
      {
        key: 'min',
        render: (_: unknown, r: any) => (r.minAmount != null ? `¥${r.minAmount}` : '-'),
        title: '门槛',
        width: 80,
      },
      {
        key: 'limit',
        render: (_: unknown, r: any) =>
          `${r.usedCount ?? 0}${r.totalLimit != null ? ` / ${r.totalLimit}` : ''}`,
        title: '已用/总量',
        width: 90,
      },
      {
        dataIndex: 'active',
        key: 'active',
        render: (a: boolean) => (a ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>),
        title: '状态',
        width: 80,
      },
      {
        key: 'actions',
        render: (_: unknown, r: any) => (
          <Flexbox horizontal gap={8}>
            <Button size="small" onClick={() => openEdit(r)}>
              编辑
            </Button>
            <Button danger size="small" onClick={() => handleDelete(r)}>
              删除
            </Button>
          </Flexbox>
        ),
        title: '操作',
        width: 140,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox horizontal justify="space-between" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>优惠券</div>
          <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13 }}>
            创建满减 / 折扣码，用于套餐订阅与积分充值
          </div>
        </div>
        <Button type="primary" onClick={openCreate}>
          新建优惠券
        </Button>
      </Flexbox>

      <Table
        columns={columns as any}
        dataSource={data || []}
        loading={isLoading}
        pagination={{ pageSize: 20 }}
        rowKey="id"
        size="middle"
      />

      <Modal
        confirmLoading={saving}
        open={open}
        title={editing ? '编辑优惠券' : '新建优惠券'}
        width={560}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {!editing && (
            <Form.Item
              extra="创建后不可修改，建议大写字母+数字"
              label="优惠码"
              name="code"
              rules={[{ required: true, message: '请输入优惠码' }]}
            >
              <Input placeholder="例如 SAVE20" style={{ textTransform: 'uppercase' }} />
            </Form.Item>
          )}
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="新用户 9 折" />
          </Form.Item>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Flexbox horizontal gap={12}>
            <Form.Item label="类型" name="type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select
                options={[
                  { label: '折扣 %', value: 'percent' },
                  { label: '满减 ¥', value: 'fixed' },
                ]}
              />
            </Form.Item>
            <Form.Item label="优惠值" name="value" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber min={0.01} style={{ width: '100%' }} />
            </Form.Item>
          </Flexbox>
          <Flexbox horizontal gap={12}>
            <Form.Item label="最低消费 ¥" name="minAmount" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              extra="仅折扣类型生效"
              label="最高优惠 ¥"
              name="maxDiscount"
              style={{ flex: 1 }}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flexbox>
          <Form.Item label="适用范围" name="scope">
            <Select
              options={[
                { label: '全部（套餐+充值）', value: 'all' },
                { label: '仅套餐订阅', value: 'subscription' },
                { label: '仅积分充值', value: 'topup' },
              ]}
            />
          </Form.Item>
          <Flexbox horizontal gap={12}>
            <Form.Item label="发放总量" name="totalLimit" style={{ flex: 1 }}>
              <InputNumber min={0} placeholder="不限" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="每人限用" name="perUserLimit" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Flexbox>
          <Flexbox horizontal gap={12}>
            <Form.Item label="生效时间" name="startsAt" style={{ flex: 1 }}>
              <Input type="datetime-local" />
            </Form.Item>
            <Form.Item label="失效时间" name="endsAt" style={{ flex: 1 }}>
              <Input type="datetime-local" />
            </Form.Item>
          </Flexbox>
          <Form.Item label="启用" name="active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Flexbox>
  );
};

export default AdminCouponsPage;
