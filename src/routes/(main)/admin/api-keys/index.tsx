'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, Modal, Switch } from '@lobehub/ui/base-ui';
import { App, Checkbox, Form, InputNumber, Table, Tag } from 'antd';
import { type FC, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminProvidersPage: FC = () => {
  const { message } = App.useApp();
  const [editId, setEditId] = useState<string | null>(null);
  const [modelsProviderId, setModelsProviderId] = useState<string | null>(null);
  const [pricingEdit, setPricingEdit] = useState<any | null>(null);
  const [pricingForm] = Form.useForm();
  const [pricingSaving, setPricingSaving] = useState(false);
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
      message.success(
        `已拉取 ${res.count} 个模型` +
          (res.prunedPlanModels ? `，已清理套餐中 ${res.prunedPlanModels} 个失效模型` : ''),
      );
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

  const openPricingEditor = (row: any) => {
    setPricingEdit(row);
    const p = row?.pricing || {};
    const byRes = p.videoCreditsPerSecondByResolution || {};
    const schemaResolutions: string[] = row?.parameters?.resolution?.enum ?? [];
    pricingForm.setFieldsValue({
      creditsPerMillionInputTokens: p.creditsPerMillionInputTokens ?? 0,
      creditsPerMillionOutputTokens: p.creditsPerMillionOutputTokens ?? 0,
      creditsPerRequest: p.creditsPerRequest ?? 0,
      supportedResolutions: schemaResolutions,
      videoCreditsPerSecond: p.videoCreditsPerSecond ?? 0,
      videoRate480p: byRes['480p'] ?? byRes['480'] ?? undefined,
      videoRate720p: byRes['720p'] ?? byRes['720'] ?? undefined,
      videoRate1080p: byRes['1080p'] ?? byRes['1080'] ?? undefined,
    });
  };

  const handleSavePricing = async () => {
    if (!modelsProviderId || !pricingEdit) return;
    try {
      setPricingSaving(true);
      const values = await pricingForm.validateFields();
      const type = pricingEdit.type || 'chat';
      const payload: any = {
        modelId: pricingEdit.id,
        providerId: modelsProviderId,
      };

      if (type === 'chat' || type === 'embedding' || !type) {
        payload.creditsPerMillionInputTokens = Number(values.creditsPerMillionInputTokens) || 0;
        payload.creditsPerMillionOutputTokens = Number(values.creditsPerMillionOutputTokens) || 0;
        // keep legacy flat field at 0 for chat token billing
        payload.creditsPerRequest = Number(values.creditsPerRequest) || 0;
      } else if (type === 'image') {
        payload.creditsPerRequest = Number(values.creditsPerRequest) || 0;
      } else if (type === 'video') {
        const byRes: Record<string, number> = {};
        if (values.videoRate480p != null && values.videoRate480p !== '')
          byRes['480p'] = Number(values.videoRate480p) || 0;
        if (values.videoRate720p != null && values.videoRate720p !== '')
          byRes['720p'] = Number(values.videoRate720p) || 0;
        if (values.videoRate1080p != null && values.videoRate1080p !== '')
          byRes['1080p'] = Number(values.videoRate1080p) || 0;
        payload.videoCreditsPerSecondByResolution = byRes;
        payload.videoCreditsPerSecond = Number(values.videoCreditsPerSecond) || 0;
        // optional legacy
        payload.creditsPerRequest = Number(values.creditsPerRequest) || 0;
      } else {
        payload.creditsPerRequest = Number(values.creditsPerRequest) || 0;
      }

      await lambdaClient.admin.updateModelCredits.mutate(payload);

      // Video models: persist the per-model supported resolutions so the
      // frontend resolution tabs show exactly these options for this model.
      if (type === 'video') {
        await (lambdaClient.admin.updateModelResolution as any).mutate({
          modelId: pricingEdit.id,
          providerId: modelsProviderId,
          resolutions: (values.supportedResolutions ?? []) as string[],
        });
      }

      message.success('计费配置已更新');
      setPricingEdit(null);
      mutateModels();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message ?? '更新失败');
    } finally {
      setPricingSaving(false);
    }
  };

  const formatPricingSummary = (row: any) => {
    const p = row?.pricing || {};
    const type = row?.type || 'chat';
    if (type === 'video') {
      const by = p.videoCreditsPerSecondByResolution || {};
      const parts = Object.entries(by)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${k}:${v}/秒`);
      if (parts.length) return parts.join(' · ');
      if (p.videoCreditsPerSecond > 0) return `${p.videoCreditsPerSecond}/秒`;
      if (p.creditsPerRequest > 0) return `${p.creditsPerRequest}/次`;
      return '未配置';
    }
    if (type === 'image') {
      return p.creditsPerRequest > 0 ? `${p.creditsPerRequest}/次` : '未配置';
    }
    const inn = Number(p.creditsPerMillionInputTokens) || 0;
    const out = Number(p.creditsPerMillionOutputTokens) || 0;
    if (inn > 0 || out > 0) return `入${inn}/M · 出${out}/M`;
    if (p.creditsPerRequest > 0) return `${p.creditsPerRequest}/次`;
    return '未配置';
  };

  // Resolution choices: common presets plus whatever the model already
  // declares (model-bank enums use uppercase '768P'), so existing values stay
  // visible as checked and are never silently dropped on save.
  const resolutionCheckboxOptions = useMemo(() => {
    const existing: string[] = pricingEdit?.parameters?.resolution?.enum ?? [];
    return Array.from(new Set(['480p', '768p', '720p', '1080p', '2k', '4k', ...existing]));
  }, [pricingEdit]);

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
      key: 'credits',
      render: (_: unknown, row: any) => (
        <Flexbox horizontal gap={4} style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 12, maxWidth: 160 }} title={formatPricingSummary(row)}>
            {formatPricingSummary(row)}
          </span>
          <Button size="small" onClick={() => openPricingEditor(row)}>
            配置
          </Button>
        </Flexbox>
      ),
      title: '积分计费',
      width: 220,
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

      {/* Model credit pricing editor */}
      <Modal
        confirmLoading={pricingSaving}
        open={!!pricingEdit}
        title={`积分计费：${pricingEdit?.displayName || pricingEdit?.id || ''}`}
        width={520}
        onCancel={() => setPricingEdit(null)}
        onOk={handleSavePricing}
      >
        <Form form={pricingForm} layout="vertical" style={{ marginTop: 12 }}>
          {(pricingEdit?.type === 'chat' ||
            pricingEdit?.type === 'embedding' ||
            !pricingEdit?.type) && (
            <>
              <div
                style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12, marginBottom: 8 }}
              >
                文本/对话模型按 Token 计费（每百万 tokens 扣多少积分）
              </div>
              <Form.Item
                extra="例如输入 5 表示每 100 万 input tokens 扣 5 积分"
                label="输入积分 / 百万 tokens"
                name="creditsPerMillionInputTokens"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                extra="例如输出 10 表示每 100 万 output tokens 扣 10 积分"
                label="输出积分 / 百万 tokens"
                name="creditsPerMillionOutputTokens"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                extra="可选兼容：按次扣费（token 单价均为 0 时生效）"
                label="兼容：积分/次"
                name="creditsPerRequest"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {pricingEdit?.type === 'image' && (
            <>
              <div
                style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12, marginBottom: 8 }}
              >
                图片模型按每次生成请求扣费（多图 = 单价 × 张数）
              </div>
              <Form.Item label="积分 / 次（每张）" name="creditsPerRequest">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {pricingEdit?.type === 'video' && (
            <>
              <div
                style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12, marginBottom: 8 }}
              >
                视频模型按「分辨率 × 秒」扣费。例：720p 每秒 10 积分，生成 5 秒 = 50 积分
              </div>
              <Form.Item
                extra="勾选后，用户前端切换到该模型时只显示这些分辨率（第一个为默认）。留空则使用通用 480p/720p/1080p。"
                label="支持的分辨率（按模型单独配置）"
                name="supportedResolutions"
              >
                <Checkbox.Group
                  options={resolutionCheckboxOptions}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
                />
              </Form.Item>
              <Form.Item label="480p 积分/秒" name="videoRate480p">
                <InputNumber min={0} placeholder="可选" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="720p 积分/秒" name="videoRate720p">
                <InputNumber min={0} placeholder="例如 10" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="1080p 积分/秒" name="videoRate1080p">
                <InputNumber min={0} placeholder="可选" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                extra="当分辨率未命中上表时使用的默认每秒积分"
                label="默认积分/秒（兜底）"
                name="videoCreditsPerSecond"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                extra="可选兼容：整段视频按次扣费（仅当秒单价均为 0 时生效）"
                label="兼容：积分/次"
                name="creditsPerRequest"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {pricingEdit?.type &&
            !['chat', 'embedding', 'image', 'video'].includes(pricingEdit.type) && (
              <Form.Item label="积分/次" name="creditsPerRequest">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            )}
        </Form>
      </Modal>
    </Flexbox>
  );
};

export default AdminProvidersPage;
