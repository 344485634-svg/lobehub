'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Select } from '@lobehub/ui/base-ui';
import { App, Card, Form, Input, InputNumber, Switch } from 'antd';
import { type FC, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import useSWR from 'swr';

import Loading from '@/components/Loading/BrandTextLoading';
import { lambdaClient } from '@/libs/trpc/client';

const { TextArea } = Input;

const AdminPlanEditPage: FC = () => {
  const { t } = useTranslation('common');
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [form] = Form.useForm();

  const {
    data: plan,
    isLoading,
    error,
  } = useSWR(id ? ['admin-plan', id] : null, () => lambdaClient.admin.getPlan.query({ id: id! }));

  useEffect(() => {
    if (plan) {
      const quotas = (plan.quotas as Record<string, number>) || {};
      form.setFieldsValue({
        active: plan.active,
        apiCalls: quotas.apiCalls,
        billingCycle: plan.billingCycle,
        chatMessages: quotas.chatMessages,
        description: plan.description,
        displayName: plan.displayName,
        fileStorage: quotas.fileStorage ? quotas.fileStorage / (1024 * 1024 * 1024) : undefined, // bytes to GB
        imageGenerations: quotas.imageGenerations,
        maxApiKeys: quotas.maxApiKeys,
        name: plan.name,
        price: parseFloat(plan.price),
        sortOrder: plan.sortOrder,
        videoGenerations: quotas.videoGenerations,
      });
    }
  }, [plan, form]);

  const handleSubmit = async (values: any) => {
    if (!id) return;

    try {
      const quotas: Record<string, number> = {};
      if (values.chatMessages !== undefined) quotas.chatMessages = values.chatMessages;
      if (values.imageGenerations !== undefined) quotas.imageGenerations = values.imageGenerations;
      if (values.videoGenerations !== undefined) quotas.videoGenerations = values.videoGenerations;
      if (values.fileStorage !== undefined)
        quotas.fileStorage = values.fileStorage * 1024 * 1024 * 1024;
      if (values.apiCalls !== undefined) quotas.apiCalls = values.apiCalls;
      if (values.maxApiKeys !== undefined) quotas.maxApiKeys = values.maxApiKeys;

      await lambdaClient.admin.updatePlan.mutate({
        active: values.active,
        billingCycle: values.billingCycle,
        description: values.description,
        displayName: values.displayName,
        id,
        name: values.name,
        price: String(values.price),
        quotas,
        sortOrder: values.sortOrder,
      });

      message.success(t('admin.planUpdated', { defaultValue: 'Plan updated successfully' }));
      navigate('/admin/plans');
    } catch (e: any) {
      message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
    }
  };

  if (isLoading) return <Loading debugId="AdminPlanEdit" />;
  if (error || !plan)
    return (
      <Flexbox padding={24}>
        {error?.message ?? t('admin.planNotFound', { defaultValue: 'Plan not found' })}
      </Flexbox>
    );

  return (
    <Flexbox padding={24}>
      <Card title={t('admin.editPlan', { defaultValue: 'Edit Plan' })}>
        <Form form={form} labelCol={{ span: 6 }} wrapperCol={{ span: 14 }} onFinish={handleSubmit}>
          <Form.Item
            required
            label={t('admin.planName', { defaultValue: 'Plan Name' })}
            name="name"
            rules={[{ message: 'Required', required: true }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            required
            label={t('admin.displayName', { defaultValue: 'Display Name' })}
            name="displayName"
            rules={[{ message: 'Required', required: true }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label={t('admin.description', { defaultValue: 'Description' })}
            name="description"
          >
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item
            required
            label={t('admin.price', { defaultValue: 'Price' })}
            name="price"
            rules={[{ message: 'Required', required: true }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            required
            label={t('admin.billingCycle', { defaultValue: 'Billing Cycle' })}
            name="billingCycle"
          >
            <Select>
              <Select.Option value="monthly">
                {t('admin.monthly', { defaultValue: 'Monthly' })}
              </Select.Option>
              <Select.Option value="yearly">
                {t('admin.yearly', { defaultValue: 'Yearly' })}
              </Select.Option>
              <Select.Option value="lifetime">
                {t('admin.lifetime', { defaultValue: 'Lifetime' })}
              </Select.Option>
            </Select>
          </Form.Item>

          <Card
            size="small"
            style={{ marginBottom: 24 }}
            title={t('admin.quotaSettings', { defaultValue: 'Quota Settings' })}
            type="inner"
          >
            <Form.Item
              label={t('admin.chatMessages', { defaultValue: 'Chat Messages/Month' })}
              name="chatMessages"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.imageGenerations', { defaultValue: 'Image Generations/Month' })}
              name="imageGenerations"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.videoGenerations', { defaultValue: 'Video Generations/Month' })}
              name="videoGenerations"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.fileStorage', { defaultValue: 'File Storage (GB)' })}
              name="fileStorage"
            >
              <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.apiCalls', { defaultValue: 'API Calls/Month' })}
              name="apiCalls"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.maxApiKeys', { defaultValue: 'Max API Keys' })}
              name="maxApiKeys"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Card>

          <Form.Item
            label={t('admin.active', { defaultValue: 'Active' })}
            name="active"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item label={t('admin.sortOrder', { defaultValue: 'Sort Order' })} name="sortOrder">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item wrapperCol={{ offset: 6, span: 14 }}>
            <Flexbox horizontal gap={12}>
              <Button htmlType="submit" type="primary">
                {t('admin.save', { defaultValue: 'Save' })}
              </Button>
              <Button onClick={() => navigate('/admin/plans')}>
                {t('admin.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </Flexbox>
          </Form.Item>
        </Form>
      </Card>
    </Flexbox>
  );
};

export default AdminPlanEditPage;
