'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button, InputNumber, Select, Switch } from '@lobehub/ui/base-ui';
import { App, Card, Form } from 'antd';
import { type FC, useEffect, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

/**
 * 注册登录配置(admin):
 * - 微信授权登录(公众号服务号网页授权 / 开放平台扫码)
 * - 手机验证码登录(阿里云短信,首验即注册)
 * 参数存 DB(system_configs),敏感密钥加密存储,保存后认证服务热加载,无需改 .env 或重启容器。
 */
const AdminAuthConfigPage: FC = () => {
  const { message } = App.useApp();
  const [wechatForm] = Form.useForm();
  const [smsForm] = Form.useForm();
  const [savingWechat, setSavingWechat] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const { data: wechat, isLoading: wechatLoading, mutate: mutateWechat } = useSWR(
    'admin-auth-wechat',
    () => lambdaClient.admin.getAuthWechatConfig.query(),
  );
  const { data: sms, isLoading: smsLoading, mutate: mutateSms } = useSWR(
    'admin-auth-sms',
    () => lambdaClient.admin.getAuthSmsConfig.query(),
  );

  useEffect(() => {
    if (!wechat) return;
    wechatForm.setFieldsValue({
      appId: wechat.appId,
      appType: wechat.appType,
      callbackDomain: wechat.callbackDomain,
      enabled: wechat.enabled,
    });
  }, [wechat, wechatForm]);

  useEffect(() => {
    if (!sms) return;
    smsForm.setFieldsValue({
      accessKeyId: sms.accessKeyId,
      codeLength: sms.codeLength,
      dailyLimitPerPhone: sms.dailyLimitPerPhone,
      enabled: sms.enabled,
      intervalSeconds: sms.intervalSeconds,
      signName: sms.signName,
      templateCode: sms.templateCode,
    });
  }, [sms, smsForm]);

  const handleSaveWechat = async () => {
    try {
      const values = await wechatForm.validateFields();
      setSavingWechat(true);
      await lambdaClient.admin.updateAuthWechatConfig.mutate({
        appId: values.appId,
        appSecret: values.appSecret || undefined,
        appType: values.appType,
        callbackDomain: values.callbackDomain,
        enabled: values.enabled,
      });
      message.success('微信登录配置已保存(即时生效)');
      wechatForm.setFieldValue('appSecret', '');
      mutateWechat();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message ?? '保存失败');
    } finally {
      setSavingWechat(false);
    }
  };

  const handleSaveSms = async () => {
    try {
      const values = await smsForm.validateFields();
      setSavingSms(true);
      await lambdaClient.admin.updateAuthSmsConfig.mutate({
        accessKeyId: values.accessKeyId,
        accessKeySecret: values.accessKeySecret || undefined,
        codeLength: values.codeLength,
        dailyLimitPerPhone: values.dailyLimitPerPhone,
        enabled: values.enabled,
        intervalSeconds: values.intervalSeconds,
        signName: values.signName,
        templateCode: values.templateCode,
      });
      message.success('短信登录配置已保存(即时生效)');
      smsForm.setFieldValue('accessKeySecret', '');
      mutateSms();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message ?? '保存失败');
    } finally {
      setSavingSms(false);
    }
  };

  const handleTestSms = async () => {
    if (!/^1[3-9]\d{9}$/.test(testPhone)) {
      message.warning('请输入合法的 11 位手机号');
      return;
    }
    setTestingSms(true);
    try {
      await lambdaClient.admin.testAuthSmsConfig.mutate({ phone: testPhone });
      message.success('测试短信已发送，请查收手机');
    } catch (e: any) {
      message.error(e?.message ?? '发送失败');
    } finally {
      setTestingSms(false);
    }
  };

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>注册登录配置</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginTop: 4 }}>
          微信授权登录与手机验证码登录。参数保存后即时生效，密钥加密存储，无需修改环境变量或重启服务。
        </div>
      </div>

      <Card loading={wechatLoading} title="微信授权登录">
        <Form form={wechatForm} layout="vertical" style={{ maxWidth: 640 }}>
          <Form.Item label="启用微信登录" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="应用类型" name="appType" tooltip="服务号=公众号网页授权(推荐,已有认证服务号即可);开放平台=PC 扫码登录(需企业认证)">
            <Select
              options={[
                { label: '公众号服务号(网页授权)', value: 'mp' },
                { label: '开放平台(扫码登录)', value: 'open' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="AppID"
            name="appId"
            rules={[{ message: '请填写 AppID', required: true }]}
          >
            <Input placeholder="wx1234567890abcdef" />
          </Form.Item>
          <Form.Item
            label="AppSecret"
            name="appSecret"
            tooltip={wechat?.hasAppSecret ? '已配置，留空则保留原值' : '尚未配置'}
          >
            <Input
              placeholder={wechat?.hasAppSecret ? '••••••••（留空保留）' : '公众号 AppSecret'}
              type="password"
            />
          </Form.Item>
          <Form.Item
            label="授权回调域名"
            name="callbackDomain"
            tooltip="公众号后台「网页授权域名」需与此一致,如 chat.xingu-ai.com(不带协议)"
          >
            <Input placeholder="chat.xingu-ai.com" />
          </Form.Item>
          <Button loading={savingWechat} type="primary" onClick={handleSaveWechat}>
            保存微信配置
          </Button>
        </Form>
      </Card>

      <Card loading={smsLoading} title="手机验证码登录(阿里云短信)">
        <Form form={smsForm} layout="vertical" style={{ maxWidth: 640 }}>
          <Form.Item label="启用手机验证码登录" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            label="AccessKey ID"
            name="accessKeyId"
            rules={[{ message: '请填写 AccessKey ID', required: true }]}
            tooltip="建议使用仅短信权限的 RAM 子账号 AK"
          >
            <Input placeholder="LTAI5t..." />
          </Form.Item>
          <Form.Item
            label="AccessKey Secret"
            name="accessKeySecret"
            tooltip={sms?.hasAccessKeySecret ? '已配置，留空则保留原值' : '尚未配置'}
          >
            <Input
              placeholder={sms?.hasAccessKeySecret ? '••••••••（留空保留）' : 'RAM 子账号 AccessKey Secret'}
              type="password"
            />
          </Form.Item>
          <Form.Item
            label="短信签名"
            name="signName"
            rules={[{ message: '请填写短信签名', required: true }]}
          >
            <Input placeholder="芯谷智能" />
          </Form.Item>
          <Form.Item
            label="模板 CODE"
            name="templateCode"
            rules={[{ message: '请填写模板 CODE', required: true }]}
          >
            <Input placeholder="SMS_123456789" />
          </Form.Item>
          <Flexbox gap={12} horizontal>
            <Form.Item label="验证码位数" name="codeLength" style={{ flex: 1 }}>
              <InputNumber max={8} min={4} />
            </Form.Item>
            <Form.Item label="发送间隔(秒)" name="intervalSeconds" style={{ flex: 1 }}>
              <InputNumber max={3600} min={30} />
            </Form.Item>
            <Form.Item label="每日上限/号" name="dailyLimitPerPhone" style={{ flex: 1 }}>
              <InputNumber max={50} min={1} />
            </Form.Item>
          </Flexbox>
          <Button loading={savingSms} type="primary" onClick={handleSaveSms}>
            保存短信配置
          </Button>
        </Form>

        <Flexbox gap={12} horizontal style={{ marginTop: 16, maxWidth: 640 }}>
          <Input
            placeholder="测试手机号(发送真实短信)"
            style={{ flex: 1 }}
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          <Button loading={testingSms} onClick={handleTestSms}>
            发送测试短信
          </Button>
        </Flexbox>
      </Card>
    </Flexbox>
  );
};

export default AdminAuthConfigPage;
