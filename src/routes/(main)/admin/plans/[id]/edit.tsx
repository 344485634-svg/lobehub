'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Select } from '@lobehub/ui/base-ui';
import { App, Card, Form, Input, InputNumber, Switch } from 'antd';
import { type FC, useEffect } from 'react';
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

  const {
    data: plan,
    error,
    isLoading,
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
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item
            required
            label="价格"
            name="price"
            rules={[{ message: '必填', required: true }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item required label="计费周期" name="billingCycle">
            <Select>
              <Select.Option value="monthly">月付</Select.Option>
              <Select.Option value="yearly">年付</Select.Option>
              <Select.Option value="lifetime">终身</Select.Option>
            </Select>
          </Form.Item>

          <Card size="small" style={{ marginBottom: 24 }} title="配额设置" type="inner">
            <Form.Item label="聊天消息数/月" name="chatMessages">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="图片生成数/月" name="imageGenerations">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="视频生成数/月" name="videoGenerations">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="文件存储上限（GB）" name="fileStorage">
              <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="API调用数/月" name="apiCalls">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="最大API Key数" name="maxApiKeys">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
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
