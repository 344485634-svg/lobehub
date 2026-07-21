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
  const [modelsProviderId, setModelsProviderId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [form] = Form.useForm();

  const { data, isLoading, mutate } = useSWR('admin-providers', () =>
    lambdaClient.admin.listProviders.query(),
  );

  const { data: detail, isLoading: detailLoading } = useSWR(
    editId ? ['admin-provider', editId] : null,
    () => lambdaClient.admin.getProvider.query({ id: editId! }),
  );

  const {
    data: models,
    isLoading: modelsLoading,
    mutate: mutateModels,
  } = useSWR(modelsProviderId ? ['admin-provider-models', modelsProviderId] : null, () =>
    lambdaClient.admin.listProviderModels.query({ providerId: modelsProviderId! }),
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

  const handleFetchModels = async () => {
    if (!modelsProviderId) return;
    setFetching(true);
    try {
      const res = await lambdaClient.admin.fetchProviderModels.mutate({
        providerId: modelsProviderId,
      });
      message.success(`已拉取 ${res.count} 个模型`);
      mutateModels();
    } catch (e: any) {
      message.error(e?.message ?? '拉取模型失败，请先检查 Base URL 和 API Key');
    } finally {
      setFetching(false);
    }
  };

  const handleToggleModel = async (modelId: string, enabled: boolean, type?: string) => {
    if (!modelsProviderId) return;
    try {
      await lambdaClient.admin.toggleProviderModel.mutate({
        enabled: !enabled,
        modelId,
        providerId: modelsProviderId,
        type,
      });
      mutateModels();
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  const handleBatchEnable = async (enabled: boolean) => {
    if (!modelsProviderId || !models?.length) return;
    try {
      await lambdaClient.admin.batchToggleProviderModels.mutate({
        enabled,
        modelIds: models.map((m: any) => m.id),
        providerId: modelsProviderId,
      });
      message.success(enabled ? '已全部启用' : '已全部禁用');
      mutateModels();
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  const providerColumns = [
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
        <Flexbox horizontal gap={8}>
          <Button size="small" onClick={() => setEditId(row.id)}>
            配置
          </Button>
          <Button size="small" type="primary" onClick={() => setModelsProviderId(row.id)}>
            模型列表
          </Button>
        </Flexbox>
      ),
      title: '操作',
    },
  ];

  const modelColumns = [
    {
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>,
      title: '模型 ID',
    },
    {
      dataIndex: 'displayName',
      key: 'displayName',
      render: (name: string, row: any) => name || row.id,
      title: '显示名称',
    },
    {
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const map: Record<string, string> = {
          chat: '对话',
          embedding: '向量',
          image: '图片',
          tts: '语音',
          video: '视频',
        };
        return <Tag>{map[type] || type || '对话'}</Tag>;
      },
      title: '类型',
      width: 90,
    },
    {
      dataIndex: 'source',
      key: 'source',
      render: (source: string) => (
        <Tag color={source === 'remote' ? 'green' : 'default'}>
          {source === 'remote' ? '上游' : source === 'builtin' ? '内置' : source || '-'}
        </Tag>
      ),
      title: '来源',
      width: 80,
    },
    {
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean, row: any) => (
        <Switch
          checked={!!enabled}
          size="small"
          onChange={() => handleToggleModel(row.id, !!enabled, row.type)}
        />
      ),
      title: '对用户开放',
      width: 110,
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13 }}>
          1）配置平台级服务商密钥 → 2）拉取上游模型 →
          3）开启需要开放的模型。用户订阅后可直接调用已开启模型。
        </div>
      </Flexbox>

      <Table
        columns={providerColumns}
        dataSource={data ?? []}
        loading={isLoading}
        pagination={false}
        rowKey="id"
      />

      {/* Provider config modal */}
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
          <Form.Item label="启用服务商" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Models management modal */}
      <Modal
        destroyOnClose
        footer={null}
        open={!!modelsProviderId}
        title={`模型列表：${modelsProviderId || ''}`}
        width={900}
        onCancel={() => setModelsProviderId(null)}
      >
        <Flexbox gap={12} style={{ marginTop: 8 }}>
          <Flexbox horizontal gap={8}>
            <Button loading={fetching} type="primary" onClick={handleFetchModels}>
              {fetching ? '拉取中…' : '从上游拉取模型'}
            </Button>
            <Button disabled={!models?.length} onClick={() => handleBatchEnable(true)}>
              全部启用
            </Button>
            <Button disabled={!models?.length} onClick={() => handleBatchEnable(false)}>
              全部禁用
            </Button>
            <span
              style={{
                color: 'var(--lobe-color-text-secondary)',
                fontSize: 12,
                lineHeight: '32px',
              }}
            >
              共 {models?.length ?? 0} 个，已启用{' '}
              {models?.filter((m: any) => m.enabled).length ?? 0} 个
            </span>
          </Flexbox>

          <Table
            columns={modelColumns}
            dataSource={models ?? []}
            loading={modelsLoading || fetching}
            pagination={{ pageSize: 20 }}
            rowKey="id"
            size="small"
          />
        </Flexbox>
      </Modal>
    </Flexbox>
  );
};

export default AdminProvidersPage;
