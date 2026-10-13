'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, InputNumber, Switch } from '@lobehub/ui/base-ui';
import { App, Card, Form } from 'antd';
import { type FC, useEffect, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminStorageConfigPage: FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data, isLoading, mutate } = useSWR('admin-storage-config', () =>
    lambdaClient.admin.getStorageConfig.query(),
  );

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      apiKey: '',
      enabled: data.enabled,
      expiration: data.expiration,
    });
  }, [data, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await lambdaClient.admin.updateStorageConfig.mutate({
        apiKey: values.apiKey || undefined,
        enabled: values.enabled,
        expiration: values.expiration ?? 0,
      });
      message.success('存储配置已保存');
      form.setFieldValue('apiKey', '');
      mutate();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await lambdaClient.admin.testStorageConfig.mutate();
      message.success(res?.message ?? '图床配置校验通过');
    } catch (e: any) {
      message.error(e?.message ?? '校验失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>存储配置</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginTop: 4 }}>
          配置 imgbb 图床（api.imgbb.com 免费申请 Key）。启用后，视频参考图等无法被模型网关直接
          访问的本地图片会自动转存为公网 URL 再提交。
        </div>
      </div>

      <Card loading={isLoading}>
        <Form form={form} layout="vertical" style={{ maxWidth: 640 }}>
          <Form.Item label="启用图床转存" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            label="imgbb API Key"
            name="apiKey"
            tooltip={data?.hasApiKey ? '已配置 API Key，留空则保留原 Key' : '尚未配置 API Key'}
          >
            <Input
              placeholder={data?.hasApiKey ? '••••••••（留空保留）' : 'imgbb API Key'}
              type="password"
            />
          </Form.Item>

          <Form.Item
            label="图片有效期（秒）"
            name="expiration"
            tooltip="0 表示永久有效；最大 15552000（180 天，imgbb 上限）"
          >
            <InputNumber max={15_552_000} min={0} step={86_400} style={{ width: 240 }} />
          </Form.Item>

          <Flexbox horizontal gap={12}>
            <Button loading={saving} type="primary" onClick={handleSave}>
              保存配置
            </Button>
            <Button loading={testing} onClick={handleTest}>
              校验（上传测试图）
            </Button>
          </Flexbox>
        </Form>
      </Card>
    </Flexbox>
  );
};

export default AdminStorageConfigPage;
