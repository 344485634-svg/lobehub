'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Select } from '@lobehub/ui/base-ui';
import { App, Card, Form, Input, InputNumber, Space, Switch, Tag } from 'antd';
import { type FC, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { lambdaClient } from '@/libs/trpc/client';

const { TextArea } = Input;

const AdminPlanEditPage: FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm();
  const [benefitInput, setBenefitInput] = useState('');
  const [benefits, setBenefits] = useState<string[]>([]);
  const [allowedModels, setAllowedModels] = useState<
    Array<{ discountRate?: number; displayName?: string; modelId: string; providerId: string }>
  >([]);

  const {
    data: plan,
    error,
    isLoading,
  } = useSWR(id ? ['admin-plan', id] : null, () => lambdaClient.admin.getPlan.query({ id: id! }));

  const { data: providers } = useSWR('admin-providers-for-plan', () =>
    lambdaClient.admin.listProviders.query(),
  );
  const enabledProviders = useMemo(
    () => (providers || []).filter((p: any) => p.enabled),
    [providers],
  );

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

  useEffect(() => {
    if (!plan) return;
    form.setFieldsValue({
      active: plan.active,
      badge: plan.badge,
      credits: plan.credits ?? 0,
      description: plan.description,
      displayName: plan.displayName,
      highlight: plan.highlight ?? false,
      monthlyOriginalPrice: plan.monthlyOriginalPrice
        ? parseFloat(String(plan.monthlyOriginalPrice))
        : undefined,
      monthlyPrice: parseFloat(String(plan.monthlyPrice || plan.price || 0)),
      name: plan.name,
      sortOrder: plan.sortOrder,
      yearlyOriginalPrice: plan.yearlyOriginalPrice
        ? parseFloat(String(plan.yearlyOriginalPrice))
        : undefined,
      yearlyPrice: plan.yearlyPrice ? parseFloat(String(plan.yearlyPrice)) : 0,
    });
    setBenefits(Array.isArray(plan.benefits) ? (plan.benefits as string[]) : []);
    setAllowedModels(
      Array.isArray(plan.allowedModels)
        ? (plan.allowedModels as Array<{
            discountRate?: number;
            displayName?: string;
            modelId: string;
            providerId: string;
          }>)
        : [],
    );
  }, [plan, form]);

  const addBenefit = () => {
    const text = benefitInput.trim();
    if (!text || benefits.includes(text)) return;
    setBenefits((b) => [...b, text]);
    setBenefitInput('');
  };

  const handleSubmit = async (values: any) => {
    if (!id) return;
    try {
      const monthlyPrice = String(values.monthlyPrice ?? 0);
      await lambdaClient.admin.updatePlan.mutate({
        active: values.active,
        allowedModels,
        badge: values.badge || null,
        benefits,
        credits: values.credits ?? 0,
        description: values.description,
        displayName: values.displayName,
        highlight: values.highlight,
        id,
        monthlyOriginalPrice: values.monthlyOriginalPrice
          ? String(values.monthlyOriginalPrice)
          : null,
        monthlyPrice,
        name: values.name,
        price: monthlyPrice,
        quotas: { credits: values.credits ?? 0 },
        sortOrder: values.sortOrder,
        yearlyOriginalPrice: values.yearlyOriginalPrice ? String(values.yearlyOriginalPrice) : null,
        yearlyPrice: String(values.yearlyPrice ?? 0),
      });
      message.success('套餐更新成功');
      navigate('/admin/plans');
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  if (isLoading) return <Loading debugId="AdminPlanEdit" />;
  if (error || !plan) return <Flexbox padding={24}>{error?.message ?? '套餐未找到'}</Flexbox>;

  return (
    <Flexbox padding={24}>
      <Card title="编辑套餐">
        <Form form={form} labelCol={{ span: 6 }} wrapperCol={{ span: 14 }} onFinish={handleSubmit}>
          <Form.Item
            required
            label="套餐标识"
            name="name"
            rules={[{ message: '必填', required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            required
            label="显示名称"
            name="displayName"
            rules={[{ message: '必填', required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item label="角标" name="badge">
            <Input placeholder="例如：最受欢迎" />
          </Form.Item>
          <Form.Item label="高亮推荐" name="highlight" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Card size="small" style={{ marginBottom: 24 }} title="价格（月付 / 年付）" type="inner">
            <Form.Item required label="月付现价" name="monthlyPrice">
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="月付原价（划线）" name="monthlyOriginalPrice">
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="年付现价" name="yearlyPrice">
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="年付原价（划线）" name="yearlyOriginalPrice">
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item required label="包含积分点" name="credits">
              <InputNumber min={0} style={{ width: '100%' }} />
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
            </Flexbox>
          </Card>

          <Card size="small" style={{ marginBottom: 24 }} title="可用模型与折扣" type="inner">
            <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12, marginBottom: 8 }}>
              选择套餐可使用的模型，并可为每个模型设置积分折扣（留空表示不打折）
            </div>
            <Select
              mode="multiple"
              options={modelOptions}
              placeholder="选择可用模型"
              style={{ marginBottom: 12, width: '100%' }}
              value={allowedModels.map((m) => `${m.providerId}::${m.modelId}`)}
              onChange={(vals) => {
                const selectedKeys = vals as string[];
                setAllowedModels((prev) => {
                  // preserve existing discountRate for already-selected models
                  const prevMap = Object.fromEntries(prev.map((m) => [`${m.providerId}::${m.modelId}`, m]));
                  return selectedKeys.map((v) => {
                    const [providerId, modelId] = v.split('::');
                    const found = (allModelsNested || []).find(
                      (m) => m.providerId === providerId && m.modelId === modelId,
                    );
                    const existing = prevMap[v];
                    return {
                      discountRate: existing?.discountRate,
                      displayName: found?.displayName,
                      modelId,
                      providerId,
                    };
                  });
                });
              }}
            />
            {allowedModels.length > 0 && (
              <Flexbox gap={8}>
                <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
                  积分折扣配置（可选）：
                </div>
                {allowedModels.map((m, idx) => (
                  <Flexbox
                    horizontal
                    gap={8}
                    key={`${m.providerId}::${m.modelId}`}
                    style={{ alignItems: 'center' }}
                  >
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {m.displayName || m.modelId}
                      <span style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 11, marginLeft: 4 }}>
                        ({m.providerId})
                      </span>
                    </span>
                    <InputNumber
                      addonAfter="折"
                      max={10}
                      min={0.1}
                      placeholder="不限"
                      step={0.1}
                      style={{ width: 140 }}
                      value={m.discountRate != null ? Math.round(m.discountRate * 10 * 10) / 10 : undefined}
                      onChange={(v) => {
                        setAllowedModels((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, discountRate: v != null ? Math.round((Number(v) / 10) * 1000) / 1000 : undefined }
                              : item,
                          ),
                        );
                      }}
                    />
                    <span style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12, minWidth: 100 }}>
                      {m.discountRate != null && m.discountRate < 1
                        ? `省 ${Math.round((1 - m.discountRate) * 100)}%`
                        : '无折扣'}
                    </span>
                  </Flexbox>
                ))}
                <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 11, marginTop: 4 }}>
                  例：8.0 折 = 消耗 100 积分的操作实际扣 80 积分
                </div>
              </Flexbox>
            )}
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
                保存
              </Button>
              <Button onClick={() => navigate('/admin/plans')}>取消</Button>
            </Flexbox>
          </Form.Item>
        </Form>
      </Card>
    </Flexbox>
  );
};

export default AdminPlanEditPage;
