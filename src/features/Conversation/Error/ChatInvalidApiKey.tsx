import { ProviderIcon } from '@lobehub/icons';
import { Button } from '@lobehub/ui';
import { memo } from 'react';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { useConversationStore } from '../store';
import BaseErrorForm from './BaseErrorForm';

interface ChatInvalidAPIKeyProps {
  id: string;
  provider?: string;
}

const ChatInvalidAPIKey = memo<ChatInvalidAPIKeyProps>(({ id, provider }) => {
  const navigate = useWorkspaceAwareNavigate();
  const [deleteMessage] = useConversationStore((s) => [s.deleteMessage]);

  return (
    <BaseErrorForm
      avatar={<ProviderIcon provider={provider} shape={'square'} size={40} />}
      desc="当前账号未开通可用模型服务。请订阅套餐后使用，或联系管理员开通。"
      title="暂无可用模型权限"
      action={
        <Button
          type={'primary'}
          onClick={() => {
            navigate('/settings/plans');
            deleteMessage(id);
          }}
        >
          查看订阅套餐
        </Button>
      }
    />
  );
});

export default ChatInvalidAPIKey;
