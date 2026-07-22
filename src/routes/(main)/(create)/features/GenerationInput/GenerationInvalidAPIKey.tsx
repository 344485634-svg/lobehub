'use client';

import { ProviderIcon } from '@lobehub/icons';
import { Button } from '@lobehub/ui';
import { memo } from 'react';

import BaseErrorForm from '@/features/Conversation/Error/BaseErrorForm';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

interface GenerationInvalidAPIKeyProps {
  onNavigate?: () => void;
  provider?: string;
}

const GenerationInvalidAPIKey = memo<GenerationInvalidAPIKeyProps>(({ provider, onNavigate }) => {
  const navigate = useWorkspaceAwareNavigate();

  return (
    <BaseErrorForm
      action={
        <Button
          type={'primary'}
          onClick={() => {
            navigate('/settings/plans');
            onNavigate?.();
          }}
        >
          查看订阅套餐
        </Button>
      }
      avatar={<ProviderIcon provider={provider} shape={'square'} size={40} />}
      desc="当前账号未开通可用模型服务。请订阅套餐后使用，或联系管理员开通。"
      title="暂无可用模型权限"
    />
  );
});

GenerationInvalidAPIKey.displayName = 'GenerationInvalidAPIKey';

export default GenerationInvalidAPIKey;
