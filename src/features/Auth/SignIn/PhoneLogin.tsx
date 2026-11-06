'use client';

import { Button, Flexbox, Input } from '@lobehub/ui';
import { App, Form } from 'antd';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { $fetch } from '@/libs/better-auth/auth-client';

interface PhoneLoginFormValues {
  code?: string;
  phone?: string;
}

/**
 * 手机验证码登录(首验即注册)。
 * 直调 better-auth phone-number 插件端点(阿里云短信,凭据由 admin 后台配置):
 *  - POST /phone-number/send-otp   发送验证码
 *  - POST /phone-number/verify     校验验证码;手机号不存在时自动注册(signUpOnVerification)
 */
export const PhoneLogin = memo(() => {
  const { t } = useTranslation('auth');
  const { message } = App.useApp();
  const [form] = Form.useForm<PhoneLoginFormValues>();
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    try {
      const { phone } = await form.validateFields(['phone']);
      const normalized = (phone || '').trim();
      if (!/^1[3-9]\d{9}$/.test(normalized)) {
        message.warning(t('betterAuth.phone.invalidPhone', { defaultValue: '请输入正确的手机号' }));
        return;
      }
      setSending(true);
      const { error } = await $fetch('/phone-number/send-otp', {
        body: { phoneNumber: normalized },
        method: 'POST',
      });
      if (error) {
        message.error(
          error.message || t('betterAuth.phone.sendFailed', { defaultValue: '验证码发送失败' }),
        );
        return;
      }
      message.success(t('betterAuth.phone.sent', { defaultValue: '验证码已发送' }));
      setCountdown(60);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (values: PhoneLoginFormValues) => {
    const normalized = (values.phone || '').trim();
    const code = (values.code || '').trim();
    if (!normalized || !code) return;
    setSubmitting(true);
    try {
      const { error } = await $fetch('/phone-number/verify', {
        body: { code, phoneNumber: normalized },
        method: 'POST',
      });
      if (error) {
        message.error(
          error.message || t('betterAuth.phone.verifyFailed', { defaultValue: '验证失败' }),
        );
        return;
      }
      // verify 成功即已注册/登录(服务端已写会话 cookie),进入应用
      const callbackUrl = new URLSearchParams(window.location.search).get('callbackUrl') || '/';
      window.location.href = callbackUrl;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item
        name="phone"
        rules={[
          {
            message: t('betterAuth.phone.invalidPhone', { defaultValue: '请输入正确的手机号' }),
            pattern: /^1[3-9]\d{9}$/,
            required: true,
          },
        ]}
      >
        <Input placeholder={t('betterAuth.phone.phonePlaceholder', { defaultValue: '手机号' })} />
      </Form.Item>
      <Form.Item
        name="code"
        rules={[
          {
            message: t('betterAuth.phone.codeRequired', { defaultValue: '请输入验证码' }),
            required: true,
          },
        ]}
      >
        <Flexbox gap={8} horizontal>
          <Input
            placeholder={t('betterAuth.phone.codePlaceholder', { defaultValue: '验证码' })}
            style={{ flex: 1 }}
          />
          <Button disabled={countdown > 0} loading={sending} onClick={handleSendCode}>
            {countdown > 0
              ? t('betterAuth.phone.resendIn', {
                  defaultValue: `{{seconds}}s 后重发`,
                  seconds: countdown,
                })
              : t('betterAuth.phone.sendCode', { defaultValue: '获取验证码' })}
          </Button>
        </Flexbox>
      </Form.Item>
      <Button block htmlType="submit" loading={submitting} size="large" type="primary">
        {t('betterAuth.phone.signIn', { defaultValue: '登录 / 注册' })}
      </Button>
    </Form>
  );
});
