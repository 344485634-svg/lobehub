'use client';

import { createModal } from '@lobehub/ui/base-ui';
import { Flexbox } from '@lobehub/ui';
import { useGlobalStore } from '@/store/global';

/**
 * 联系我们：展示企业微信 / 客服二维码。
 * 将真实二维码放到 public/contact-wechat.png（建议 400×400）。
 */
const WechatContactContent = () => {
  return (
    <Flexbox align="center" gap={16} style={{ padding: '8px 12px 20px' }}>
      <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, textAlign: 'center' }}>
        请使用微信扫描下方二维码添加客服
      </div>
      <div
        style={{
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 12,
          padding: 12,
        }}
      >
        <img
          alt="微信客服二维码"
          src="/contact-wechat.png"
          style={{ display: 'block', height: 220, objectFit: 'contain', width: 220 }}
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = 'none';
            const tip = el.nextElementSibling as HTMLElement | null;
            if (tip) tip.style.display = 'flex';
          }}
        />
        <div
          style={{
            alignItems: 'center',
            color: '#999',
            display: 'none',
            flexDirection: 'column',
            fontSize: 13,
            height: 220,
            justifyContent: 'center',
            textAlign: 'center',
            width: 220,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>暂未配置二维码</div>
          <div>
            请将客服微信二维码图片放到
            <br />
            <code>public/contact-wechat.png</code>
          </div>
        </div>
      </div>
      <div style={{ color: 'var(--lobe-color-text-tertiary)', fontSize: 12 }}>
        工作日 9:00–18:00 在线
      </div>
    </Flexbox>
  );
};

export const openWechatContactModal = () => {
  useGlobalStore.getState().updateSystemStatus({ showCommandMenu: false });

  return createModal({
    content: <WechatContactContent />,
    footer: null,
    maskClosable: true,
    title: '联系我们',
    width: 360,
  });
};

export default openWechatContactModal;
