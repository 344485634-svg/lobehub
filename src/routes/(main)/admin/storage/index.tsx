'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, InputNumber, Select, Switch } from '@lobehub/ui/base-ui';
import { App, Card, Form } from 'antd';
import { type FC, useEffect, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminStorageConfigPage: FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const provider = Form.useWatch('provider', form) || 'imgbb';

  const { data, isLoading, mutate } = useSWR('admin-storage-config', () =>
    lambdaClient.admin.getStorageConfig.query(),
  );

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      apiKey: '',
      enabled: data.enabled,
      expiration: data.expiration,
      provider: data.provider || 'imgbb',
    });
  }, [data, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await lambdaClient.admin.updateStorageConfig.mutate({
        apiKey: values.apiKey || undefined,
        enabled: values.enabled,
        expiration: provider === 'imgbb' ? (values.expiration ?? 0) : 0,
        provider: values.provider,
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
          配置免费图床。启用后，视频参考图等无法被模型网关直接访问的本地图片会自动转存为公网 URL
          再提交。推荐 img.scdn.io：免费、国内可直连、无需注册。
        </div>
      </div>

      <Card loading={isLoading}>
        <Form form={form} layout="vertical" style={{ maxWidth: 640 }}>
          <Form.Item label="启用图床转存" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="图床服务商" name="provider">
            <Select
              options={[
                { label: 'img.scdn.io（免费，国内可直连，无需注册）', value: 'scdn' },
                { label: 'imgbb（海外，需 API Key，部分地区账号会被封）', value: 'imgbb' },
              ]}
            />
          </Form.Item>

          {provider === 'imgbb' && (
            <>
              <Form.Item
                label="imgbb API Key"
                name="apiKey"
                tooltip={data?.hasApiKey ? '已配置，留空则保留原 Key' : '尚未配置'}
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
            </>
          )}

          {provider === 'scdn' && (
            <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13 }}>
              img.scdn.io 为免登录匿名上传，无需填写任何 Key，直接保存并校验即可。
            </div>
          )}

          <Flexbox horizontal gap={12} style={{ marginTop: 16 }}>
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
