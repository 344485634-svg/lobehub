'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, Modal, Switch } from '@lobehub/ui/base-ui';
import { App, Form, Table, Tag } from 'antd';
import { type FC, useEffect, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminProvidersPage: FC = () => {
  const { message } = App.useApp();
  const [editId, setEditId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading, mutate } = useSWR('admin-providers', () =>
    lambdaClient.admin.listProviders.query(),
  );

  const { data: detail, isLoading: detailLoading } = useSWR(
    editId ? ['admin-provider', editId] : null,
    () => lambdaClient.admin.getProvider.query({ id: editId! }),
  );

  useEffect(() => {
    if (!detail || !editId) return;
    form.setFieldsValue({
      apiKey: '',
      baseURL: (detail.keyVaults as any)?.baseURL || '',
      enabled: detail.enabled ?? false,
      name: detail.name || detail.id,
    });
  }, [detail, editId, form]);

  const handleSave = async () => {
    if (!editId) return;
    try {
      const values = await form.validateFields();
      const keyVaults: { apiKey?: string; baseURL?: string } = {};
      if (values.apiKey) keyVaults.apiKey = values.apiKey;
      if (values.baseURL !== undefined) keyVaults.baseURL = values.baseURL;

      await lambdaClient.admin.updateProviderConfig.mutate({
        enabled: values.enabled,
        id: editId,
        keyVaults: Object.keys(keyVaults).length ? keyVaults : undefined,
        name: values.name,
      });
      message.success('服务商配置已保存');
      setEditId(null);
      form.resetFields();
      mutate();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message ?? '保存失败');
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await lambdaClient.admin.toggleProviderEnabled.mutate({ enabled: !enabled, id });
      message.success(enabled ? '已禁用' : '已启用');
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  const columns = [
    {
      dataIndex: 'id',
      key: 'id',
      title: '服务商 ID',
    },
    {
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: any) => name || row.id,
      title: '显示名称',
    },
    {
      dataIndex: 'source',
      key: 'source',
      render: (source: string) => (
        <Tag>{source === 'builtin' ? '内置' : source === 'custom' ? '自定义' : source}</Tag>
      ),
      title: '类型',
    },
    {
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, row: any) => (
        <Switch checked={!!enabled} size="small" onChange={() => handleToggle(row.id, !!enabled)} />
      ),
      title: '启用',
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Button size="small" onClick={() => setEditId(row.id)}>
          配置
        </Button>
      ),
      title: '操作',
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13 }}>
          配置平台级模型服务商密钥。用户订阅套餐后即可使用，无需自行填写 API Key。
        </div>
      </Flexbox>

      <Table
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        pagination={false}
        rowKey="id"
      />

      <Modal
        destroyOnClose
        confirmLoading={detailLoading}
        open={!!editId}
        title={`配置服务商：${editId || ''}`}
        width={520}
        onOk={handleSave}
        onCancel={() => {
          setEditId(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="显示名称" name="name">
            <Input placeholder="例如：LIUMA 官方 API" />
          </Form.Item>
          <Form.Item
            label="API Base URL"
            name="baseURL"
            tooltip="OpenAI 兼容网关地址，例如 https://api.liuma.ai/v1"
          >
            <Input placeholder="https://api.liuma.ai/v1" />
          </Form.Item>
          <Form.Item
            label="API Key"
            name="apiKey"
            tooltip={
              (detail?.keyVaults as any)?.hasApiKey
                ? `当前已配置：${(detail?.keyVaults as any)?.apiKeyMasked || '••••'}，留空则保留原密钥`
                : '尚未配置密钥'
            }
          >
            <Input
              type="password"
              placeholder={
                (detail?.keyVaults as any)?.hasApiKey ? '••••••••（留空保留）' : 'sk-...'
              }
            />
          </Form.Item>
          <Form.Item label="启用" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Flexbox>
  );
};

export default AdminProvidersPage;
