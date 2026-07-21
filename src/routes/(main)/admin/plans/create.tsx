'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Select } from '@lobehub/ui/base-ui';
import { App, Card, Form, Input, InputNumber, Switch } from 'antd';
import { type FC } from 'react';
import { useNavigate } from 'react-router';

import { lambdaClient } from '@/libs/trpc/client';

const { TextArea } = Input;

const AdminPlanCreatePage: FC = () => {
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
            <TextArea placeholder="描述此套餐" rows={3} />
          </Form.Item>

          <Form.Item
            required
            label="价格"
            name="price"
            rules={[{ message: '必填', required: true }]}
          >
            <InputNumber min={0} placeholder="99.00" step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item required label="计费周期" name="billingCycle">
            <Select
              options={[
                { label: '月付', value: 'monthly' },
                { label: '年付', value: 'yearly' },
                { label: '终身', value: 'lifetime' },
              ]}
            />
          </Form.Item>

          <Card size="small" style={{ marginBottom: 24 }} title="配额设置" type="inner">
            <Form.Item label="聊天消息数/月" name="chatMessages">
              <InputNumber min={0} placeholder="1000" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="图片生成数/月" name="imageGenerations">
              <InputNumber min={0} placeholder="50" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="视频生成数/月" name="videoGenerations">
              <InputNumber min={0} placeholder="10" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="文件存储上限（GB）" name="fileStorage">
              <InputNumber min={0} placeholder="5" step={0.1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="API调用数/月" name="apiCalls">
              <InputNumber min={0} placeholder="10000" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="最大API Key数" name="maxApiKeys">
              <InputNumber min={0} placeholder="5" style={{ width: '100%' }} />
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
