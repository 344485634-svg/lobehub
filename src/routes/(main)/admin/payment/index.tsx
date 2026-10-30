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
  const [activating, setActivating] = useState(false);

  const { data, isLoading, mutate } = useSWR('admin-payment-config', () =>
    lambdaClient.admin.getPaymentConfig.query(),
  );

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      activationCode: '',
      appId: data.appId,
      enabled: data.enabled,
      env: data.env || 'sandbox',
      notifyUrl: data.notifyUrl,
      payways: data.payways || ['alipay', 'wechat'],
      remark: data.remark,
      returnUrl: data.returnUrl,
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
        vendorKey: values.vendorKey || undefined,
        vendorSn: values.vendorSn,
      });
      message.success('支付配置已保存');
      form.setFieldsValue({ vendorKey: '' });
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

  const handleActivate = async () => {
    try {
      const values = await form.validateFields(['activationCode']);
      if (!values.activationCode) {
        message.error('请输入激活码');
        return;
      }
      setActivating(true);
      const res = await lambdaClient.admin.activateTerminal.mutate({
        activationCode: values.activationCode,
      });
      message.success(`${res.message}，终端号：${res.terminalSn}`);
      form.setFieldsValue({ activationCode: '' });
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '激活失败');
    } finally {
      setActivating(false);
    }
  };

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>支付配置（收钱吧）</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginTop: 4 }}>
          对接第三方收钱吧，用于套餐订阅收款。密钥加密存储。
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

          <Form.Item label="App ID（开发者序列号对应的应用ID）" name="appId">
            <Input placeholder="收钱吧应用 app_id" />
          </Form.Item>

          <Form.Item label="开发者序列号 Vendor SN" name="vendorSn">
            <Input placeholder="vendor_sn" />
          </Form.Item>

          <Form.Item
            label="开发者密钥 Vendor Key"
            name="vendorKey"
            tooltip={data?.hasVendorKey ? '已配置，留空保留原值' : '尚未配置'}
          >
            <Input
              placeholder={data?.hasVendorKey ? '••••••••（留空保留）' : 'vendor_key'}
              type="password"
            />
          </Form.Item>

          <div
            style={{
              background: 'var(--lobe-color-bg-container)',
              border: '1px solid var(--lobe-color-border)',
              borderRadius: 8,
              marginBottom: 24,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 12 }}>终端激活</div>
            <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
              输入门店设备激活码，自动生成终端号和终端密钥
            </div>
            <Form.Item label="门店设备激活码" name="activationCode" style={{ marginBottom: 12 }}>
              <Input placeholder="从收钱吧商户后台获取的激活码" />
            </Form.Item>
            <Button loading={activating} type="primary" onClick={handleActivate}>
              激活终端
            </Button>
            {data?.terminalSn && (
              <div style={{ color: 'var(--lobe-color-success)', fontSize: 13, marginTop: 8 }}>
                终端号：{data.terminalSn}
              </div>
            )}
          </div>

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
            <Input placeholder="https://your-domain.com/webapi/payment/shouqianba/notify" />
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
            <Tag color={data?.terminalSn ? 'green' : 'default'}>
              终端 {data?.terminalSn ? '已激活' : '未激活'}
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
