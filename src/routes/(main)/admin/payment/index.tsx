'use client';

import { Flexbox, Input, TextArea } from '@lobehub/ui';
import { Button, Select, Switch } from '@lobehub/ui/base-ui';
import { App, Card, Form, Tag } from 'antd';
import { type FC, useEffect, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminPaymentConfigPage: FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data, isLoading, mutate } = useSWR('admin-payment-config', () =>
    lambdaClient.admin.getPaymentConfig.query(),
  );

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      appId: data.appId,
      enabled: data.enabled,
      env: data.env || 'sandbox',
      notifyUrl: data.notifyUrl,
      payways: data.payways || ['alipay', 'wechat'],
      remark: data.remark,
      returnUrl: data.returnUrl,
      terminalKey: '',
      terminalSn: data.terminalSn,
      vendorKey: '',
      vendorSn: data.vendorSn,
    });
  }, [data, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await lambdaClient.admin.updatePaymentConfig.mutate({
        appId: values.appId,
        enabled: values.enabled,
        env: values.env,
        notifyUrl: values.notifyUrl,
        payways: values.payways,
        remark: values.remark,
        returnUrl: values.returnUrl,
        terminalKey: values.terminalKey || undefined,
        terminalSn: values.terminalSn,
        vendorKey: values.vendorKey || undefined,
        vendorSn: values.vendorSn,
      });
      message.success('支付配置已保存');
      form.setFieldsValue({ terminalKey: '', vendorKey: '' });
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
      const res = await lambdaClient.admin.testPaymentConfig.mutate();
      message.success(res.message || '配置校验通过');
    } catch (e: any) {
      message.error(e?.message ?? '校验失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>支付配置（收钱吧）</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginTop: 4 }}>
          对接第三方收钱吧，用于套餐订阅收款。密钥加密存储。下单/回调接口将在支付对接阶段启用。
        </div>
      </div>

      <Card loading={isLoading}>
        <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
          <Form.Item label="启用收钱吧支付" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="环境" name="env">
            <Select
              options={[
                { label: '沙箱 (sandbox)', value: 'sandbox' },
                { label: '生产 (production)', value: 'production' },
              ]}
            />
          </Form.Item>

          <Form.Item label="App ID" name="appId">
            <Input placeholder="收钱吧应用 app_id" />
          </Form.Item>

          <Form.Item label="Vendor SN" name="vendorSn">
            <Input placeholder="vendor_sn" />
          </Form.Item>

          <Form.Item
            label="Vendor Key"
            name="vendorKey"
            tooltip={data?.hasVendorKey ? '已配置，留空保留原值' : '尚未配置'}
          >
            <Input
              placeholder={data?.hasVendorKey ? '••••••••（留空保留）' : 'vendor_key'}
              type="password"
            />
          </Form.Item>

          <Form.Item label="Terminal SN" name="terminalSn">
            <Input placeholder="terminal_sn" />
          </Form.Item>

          <Form.Item
            label="Terminal Key"
            name="terminalKey"
            tooltip={data?.hasTerminalKey ? '已配置，留空保留原值' : '尚未配置'}
          >
            <Input
              placeholder={data?.hasTerminalKey ? '••••••••（留空保留）' : 'terminal_key'}
              type="password"
            />
          </Form.Item>

          <Form.Item label="支付方式" name="payways">
            <Select
              mode="multiple"
              options={[
                { label: '支付宝', value: 'alipay' },
                { label: '微信支付', value: 'wechat' },
                { label: '银联', value: 'unionpay' },
              ]}
            />
          </Form.Item>

          <Form.Item label="支付回调 Notify URL" name="notifyUrl">
            <Input placeholder="https://your-domain.com/api/webhooks/shouqianba" />
          </Form.Item>

          <Form.Item label="前台回跳 Return URL" name="returnUrl">
            <Input placeholder="https://your-domain.com/settings/plans" />
          </Form.Item>

          <Form.Item label="备注" name="remark">
            <TextArea placeholder="可选备注" rows={3} />
          </Form.Item>

          <Flexbox horizontal gap={8} style={{ marginBottom: 16 }}>
            <Tag color={data?.enabled ? 'green' : 'default'}>
              {data?.enabled ? '已启用' : '未启用'}
            </Tag>
            <Tag color={data?.hasVendorKey ? 'blue' : 'default'}>
              VendorKey {data?.hasVendorKey ? '已配置' : '未配置'}
            </Tag>
            <Tag color={data?.hasTerminalKey ? 'blue' : 'default'}>
              TerminalKey {data?.hasTerminalKey ? '已配置' : '未配置'}
            </Tag>
          </Flexbox>

          <Flexbox horizontal gap={12}>
            <Button loading={saving} type="primary" onClick={handleSave}>
              保存配置
            </Button>
            <Button loading={testing} onClick={handleTest}>
              校验配置
            </Button>
          </Flexbox>
        </Form>
      </Card>
    </Flexbox>
  );
};

export default AdminPaymentConfigPage;
