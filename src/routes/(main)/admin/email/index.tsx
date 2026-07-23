'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, Select, Switch } from '@lobehub/ui/base-ui';
import { App, Card, Form, InputNumber } from 'antd';
import { type FC, useEffect, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminEmailConfigPage: FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [testTo, setTestTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data, isLoading, mutate } = useSWR('admin-email-config', () =>
    lambdaClient.admin.getEmailConfig.query(),
  );

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      enabled: data.enabled,
      from: data.from,
      host: data.host,
      pass: '',
      port: data.port,
      provider: data.provider || 'nodemailer',
      requireVerification: data.requireVerification,
      secure: data.secure,
      user: data.user,
    });
  }, [data, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await lambdaClient.admin.updateEmailConfig.mutate({
        enabled: values.enabled,
        from: values.from,
        host: values.host,
        pass: values.pass || undefined,
        port: values.port,
        provider: values.provider,
        requireVerification: values.requireVerification,
        secure: values.secure,
        user: values.user,
      });
      message.success('邮箱配置已保存');
      form.setFieldValue('pass', '');
      mutate();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testTo) {
      message.warning('请输入测试收件邮箱');
      return;
    }
    setTesting(true);
    try {
      await lambdaClient.admin.testEmailConfig.mutate({ to: testTo });
      message.success('测试邮件已发送，请查收');
    } catch (e: any) {
      message.error(e?.message ?? '发送失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>邮箱配置</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginTop: 4 }}>
          配置 SMTP，用于注册激活验证、重置密码等系统邮件。密码加密存储。
        </div>
      </div>

      <Card loading={isLoading}>
        <Form form={form} layout="vertical" style={{ maxWidth: 640 }}>
          <Form.Item label="启用邮箱服务" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            label="要求邮箱验证（注册/登录）"
            name="requireVerification"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item label="服务商" name="provider">
            <Select
              options={[
                { label: 'SMTP (Nodemailer)', value: 'nodemailer' },
                { label: 'Resend', value: 'resend' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="SMTP Host"
            name="host"
            rules={[{ message: '请填写 SMTP Host', required: true }]}
          >
            <Input placeholder="smtp.exmail.qq.com" />
          </Form.Item>

          <Flexbox horizontal gap={12}>
            <Form.Item label="端口" name="port" style={{ flex: 1 }}>
              <InputNumber max={65535} min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="SSL/TLS" name="secure" style={{ flex: 1 }} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Flexbox>

          <Form.Item label="SMTP 用户名" name="user">
            <Input placeholder="noreply@your-domain.com" />
          </Form.Item>

          <Form.Item
            label="SMTP 密码"
            name="pass"
            tooltip={data?.hasPass ? '已配置密码，留空则保留原密码' : '尚未配置密码'}
          >
            <Input
              placeholder={data?.hasPass ? '••••••••（留空保留）' : 'SMTP 密码或授权码'}
              type="password"
            />
          </Form.Item>

          <Form.Item label="发件人 From" name="from">
            <Input placeholder="LM Studio <noreply@your-domain.com>" />
          </Form.Item>

          <Flexbox horizontal gap={12}>
            <Button loading={saving} type="primary" onClick={handleSave}>
              保存配置
            </Button>
          </Flexbox>
        </Form>
      </Card>

      <Card title="发送测试邮件">
        <Flexbox horizontal gap={12} style={{ maxWidth: 640 }}>
          <Input
            placeholder="测试收件邮箱"
            style={{ flex: 1 }}
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <Button loading={testing} onClick={handleTest}>
            发送测试
          </Button>
        </Flexbox>
      </Card>
    </Flexbox>
  );
};

export default AdminEmailConfigPage;
