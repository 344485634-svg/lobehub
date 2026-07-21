'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Select } from '@lobehub/ui/base-ui';
import { App, Card, Form, Input, InputNumber, Switch } from 'antd';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { lambdaClient } from '@/libs/trpc/client';

const { TextArea } = Input;

const AdminPlanCreatePage: FC = () => {
  const { t } = useTranslation('common');
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    try {
      // Convert quotas from form structure to flat object
      const quotas: Record<string, number> = {};
      if (values.chatMessages) quotas.chatMessages = values.chatMessages;
      if (values.imageGenerations) quotas.imageGenerations = values.imageGenerations;
      if (values.videoGenerations) quotas.videoGenerations = values.videoGenerations;
      if (values.fileStorage) quotas.fileStorage = values.fileStorage * 1024 * 1024 * 1024; // GB to bytes
      if (values.apiCalls) quotas.apiCalls = values.apiCalls;
      if (values.maxApiKeys) quotas.maxApiKeys = values.maxApiKeys;

      await lambdaClient.admin.createPlan.mutate({
        active: values.active ?? true,
        billingCycle: values.billingCycle,
        description: values.description,
        displayName: values.displayName,
        features: values.features || [],
        name: values.name,
        price: String(values.price),
        quotas,
        sortOrder: values.sortOrder ?? 0,
      });

      message.success(t('admin.planCreated', { defaultValue: 'Plan created successfully' }));
      navigate('/admin/plans');
    } catch (e: any) {
      message.error(e?.message ?? t('admin.actionFailed', { defaultValue: 'Action failed' }));
    }
  };

  return (
    <Flexbox padding={24}>
      <Card title={t('admin.createPlan', { defaultValue: 'Create Plan' })}>
        <Form
          form={form}
          labelCol={{ span: 6 }}
          wrapperCol={{ span: 14 }}
          initialValues={{
            active: true,
            billingCycle: 'monthly',
            sortOrder: 0,
          }}
          onFinish={handleSubmit}
        >
          <Form.Item
            required
            label={t('admin.planName', { defaultValue: 'Plan Name' })}
            name="name"
            rules={[{ message: 'Required', required: true }]}
          >
            <Input placeholder="e.g. pro" />
          </Form.Item>

          <Form.Item
            required
            label={t('admin.displayName', { defaultValue: 'Display Name' })}
            name="displayName"
            rules={[{ message: 'Required', required: true }]}
          >
            <Input placeholder="e.g. Pro Plan" />
          </Form.Item>

          <Form.Item
            label={t('admin.description', { defaultValue: 'Description' })}
            name="description"
          >
            <TextArea
              placeholder={t('admin.planDescription', { defaultValue: 'Describe this plan' })}
              rows={3}
            />
          </Form.Item>

          <Form.Item
            required
            label={t('admin.price', { defaultValue: 'Price' })}
            name="price"
            rules={[{ message: 'Required', required: true }]}
          >
            <InputNumber min={0} placeholder="99.00" step={0.01} style={{ width: '100%' }} />
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
              <InputNumber min={0} placeholder="1000" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.imageGenerations', { defaultValue: 'Image Generations/Month' })}
              name="imageGenerations"
            >
              <InputNumber min={0} placeholder="50" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.videoGenerations', { defaultValue: 'Video Generations/Month' })}
              name="videoGenerations"
            >
              <InputNumber min={0} placeholder="10" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.fileStorage', { defaultValue: 'File Storage (GB)' })}
              name="fileStorage"
            >
              <InputNumber min={0} placeholder="5" step={0.1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.apiCalls', { defaultValue: 'API Calls/Month' })}
              name="apiCalls"
            >
              <InputNumber min={0} placeholder="10000" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label={t('admin.maxApiKeys', { defaultValue: 'Max API Keys' })}
              name="maxApiKeys"
            >
              <InputNumber min={0} placeholder="5" style={{ width: '100%' }} />
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
                {t('admin.create', { defaultValue: 'Create' })}
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

export default AdminPlanCreatePage;
