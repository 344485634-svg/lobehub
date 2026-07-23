'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Select } from '@lobehub/ui/base-ui';
import { App, Card, Form, Input, InputNumber, Space, Switch, Tag } from 'antd';
import { type FC, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const { TextArea } = Input;

const AdminPlanCreatePage: FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [benefitInput, setBenefitInput] = useState('');
  const [benefits, setBenefits] = useState<string[]>([]);
  const [allowedModels, setAllowedModels] = useState<
    Array<{ displayName?: string; modelId: string; providerId: string }>
  >([]);

  const { data: providers } = useSWR('admin-providers-for-plan', () =>
    lambdaClient.admin.listProviders.query(),
  );

  const enabledProviders = useMemo(
    () => (providers || []).filter((p: any) => p.enabled),
    [providers],
  );

  // Load models for all enabled providers
  const { data: allModelsNested } = useSWR(
    enabledProviders.length
      ? ['plan-models', enabledProviders.map((p: any) => p.id).join(',')]
      : null,
    async () => {
      const lists = await Promise.all(
        enabledProviders.map(async (p: any) => {
          const models = await lambdaClient.admin.listProviderModels.query({ providerId: p.id });
          return (models || [])
            .filter((m: any) => m.enabled)
            .map((m: any) => ({
              displayName: m.displayName || m.id,
              modelId: m.id,
              providerId: p.id,
              type: m.type,
            }));
        }),
      );
      return lists.flat();
    },
  );

  const modelOptions = useMemo(
    () =>
      (allModelsNested || []).map((m) => ({
        label: `${m.displayName} (${m.providerId}/${m.modelId})`,
        value: `${m.providerId}::${m.modelId}`,
      })),
    [allModelsNested],
  );

  const addBenefit = () => {
    const text = benefitInput.trim();
    if (!text) return;
    if (benefits.includes(text)) return;
    setBenefits((b) => [...b, text]);
    setBenefitInput('');
  };

  const handleSubmit = async (values: any) => {
    try {
      const monthlyPrice = String(values.monthlyPrice ?? 0);
      await lambdaClient.admin.createPlan.mutate({
        active: values.active ?? true,
        allowedModels,
        badge: values.badge || undefined,
        benefits,
        billingCycle: 'monthly',
        credits: values.credits ?? 0,
        description: values.description,
        displayName: values.displayName,
        highlight: values.highlight ?? false,
        monthlyOriginalPrice: values.monthlyOriginalPrice
          ? String(values.monthlyOriginalPrice)
          : undefined,
        monthlyPrice,
        name: values.name,
        price: monthlyPrice,
        quotas: { credits: values.credits ?? 0 },
        sortOrder: values.sortOrder ?? 0,
        yearlyOriginalPrice: values.yearlyOriginalPrice
          ? String(values.yearlyOriginalPrice)
          : undefined,
        yearlyPrice: String(values.yearlyPrice ?? 0),
      });
      message.success('套餐创建成功');
      navigate('/admin/plans');
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  return (
    <Flexbox padding={24}>
      <Card title="创建套餐">
        <Form
          form={form}
          initialValues={{ active: true, credits: 1000, highlight: false, sortOrder: 0 }}
          labelCol={{ span: 6 }}
          wrapperCol={{ span: 14 }}
          onFinish={handleSubmit}
        >
          <Form.Item
            required
            label="套餐标识"
            name="name"
            rules={[{ message: '必填', required: true }]}
          >
            <Input placeholder="例如：pro" />
          </Form.Item>
          <Form.Item
            required
            label="显示名称"
            name="displayName"
            rules={[{ message: '必填', required: true }]}
          >
            <Input placeholder="例如：专业版" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea placeholder="一句话卖点" rows={2} />
          </Form.Item>
          <Form.Item label="角标" name="badge">
            <Input placeholder="例如：最受欢迎 / 限时优惠" />
          </Form.Item>
          <Form.Item label="高亮推荐" name="highlight" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Card size="small" style={{ marginBottom: 24 }} title="价格（月付 / 年付）" type="inner">
            <Form.Item
              required
              label="月付现价"
              name="monthlyPrice"
              rules={[{ message: '必填', required: true }]}
            >
              <InputNumber min={0} placeholder="99" step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="月付原价（划线）" name="monthlyOriginalPrice">
              <InputNumber min={0} placeholder="149" step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="年付现价" name="yearlyPrice">
              <InputNumber min={0} placeholder="990" step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="年付原价（划线）" name="yearlyOriginalPrice">
              <InputNumber min={0} placeholder="1788" step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              required
              label="包含积分点"
              name="credits"
              tooltip="用户开通后获得的积分，用于按模型扣费"
            >
              <InputNumber min={0} placeholder="10000" style={{ width: '100%' }} />
            </Form.Item>
          </Card>

          <Card size="small" style={{ marginBottom: 24 }} title="权益文案" type="inner">
            <Space.Compact style={{ marginBottom: 12, width: '100%' }}>
              <Input
                placeholder="例如：支持 Seedance 2.0 快速通道"
                value={benefitInput}
                onChange={(e) => setBenefitInput(e.target.value)}
                onPressEnter={addBenefit}
              />
              <Button type="primary" onClick={addBenefit}>
                添加
              </Button>
            </Space.Compact>
            <Flexbox horizontal gap={8} style={{ flexWrap: 'wrap' }}>
              {benefits.map((b) => (
                <Tag
                  closable
                  key={b}
                  onClose={() => setBenefits((list) => list.filter((x) => x !== b))}
                >
                  {b}
                </Tag>
              ))}
              {!benefits.length && (
                <span style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
                  暂无权益，添加后会展示在用户订阅页
                </span>
              )}
            </Flexbox>
          </Card>

          <Card size="small" style={{ marginBottom: 24 }} title="可用模型" type="inner">
            <div
              style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12, marginBottom: 8 }}
            >
              仅管理员已启用的模型可选。用户前端只能看到并使用此处配置的模型。
            </div>
            <Select
              mode="multiple"
              options={modelOptions}
              placeholder="选择可用模型"
              style={{ width: '100%' }}
              value={allowedModels.map((m) => `${m.providerId}::${m.modelId}`)}
              onChange={(vals) => {
                const selected = (vals as string[]).map((v) => {
                  const [providerId, modelId] = v.split('::');
                  const found = (allModelsNested || []).find(
                    (m) => m.providerId === providerId && m.modelId === modelId,
                  );
                  return {
                    displayName: found?.displayName,
                    modelId,
                    providerId,
                  };
                });
                setAllowedModels(selected);
              }}
            />
          </Card>

          <Form.Item label="启用" name="active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="排序" name="sortOrder">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item wrapperCol={{ offset: 6, span: 14 }}>
            <Flexbox horizontal gap={12}>
              <Button htmlType="submit" type="primary">
                创建
              </Button>
              <Button onClick={() => navigate('/admin/plans')}>取消</Button>
            </Flexbox>
          </Form.Item>
        </Form>
      </Card>
    </Flexbox>
  );
};

export default AdminPlanCreatePage;
