'use client';

import { Center, Empty } from '@lobehub/ui';
import { memo } from 'react';
import { useNavigate } from 'react-router';

// Closed product: personal provider settings are disabled.
// Model providers are managed exclusively in Admin → 模型服务商.
export const ProviderLayout = memo(() => {
  const navigate = useNavigate();

  return (
    <Center height="100%" width="100%">
      <Empty
        description="模型服务商已由管理员统一配置，个人设置入口已关闭。请前往管理后台配置。"
        title="模型服务商"
      />
      <a
        href="/admin/api-keys"
        style={{ marginTop: 16 }}
        onClick={(e) => {
          e.preventDefault();
          navigate('/admin/api-keys');
        }}
      >
        前往管理后台
      </a>
    </Center>
  );
});

ProviderLayout.displayName = 'ProviderLayout';

export const ProviderDetailPage = memo(() => {
  const navigate = useNavigate();

  return (
    <Center height="100%" width="100%">
      <Empty description="模型服务商已由管理员统一配置，个人设置入口已关闭。" title="模型服务商" />
      <a
        href="/admin/api-keys"
        style={{ marginTop: 16 }}
        onClick={(e) => {
          e.preventDefault();
          navigate('/admin/api-keys');
        }}
      >
        前往管理后台
      </a>
    </Center>
  );
});

ProviderDetailPage.displayName = 'ProviderDetailPage';
