'use client';

import { Button } from '@lobehub/ui';
import { App, Input, Modal, Typography } from 'antd';
import { useState } from 'react';

import { lambdaClient } from '@/libs/trpc/client';
import { useUserStore } from '@/store/user';

import ProfileRow from './ProfileRow';

const DeleteAccountRow = () => {
  const { message } = App.useApp();
  const logout = useUserStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    try {
      await lambdaClient.user.deleteAccount.mutate({ confirm: 'DELETE' });
      message.success('账号已注销');
      await logout();
      window.location.href = '/';
    } catch (e: any) {
      message.error(e?.message || '注销失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ProfileRow
        label="注销账号"
        action={
          <Button danger size="small" onClick={() => setOpen(true)}>
            注销账号
          </Button>
        }
      >
        <Typography.Text type="secondary">
          永久删除账号及相关数据，此操作无法恢复
        </Typography.Text>
      </ProfileRow>

      <Modal
        cancelText="取消"
        confirmLoading={loading}
        okButtonProps={{ danger: true, disabled: confirmText !== 'DELETE' }}
        okText="永久注销"
        open={open}
        title="确认注销账号"
        onCancel={() => {
          if (loading) return;
          setOpen(false);
          setConfirmText('');
        }}
        onOk={handleDelete}
      >
        <Typography.Paragraph type="danger" strong>
          注销后，账号、订阅记录、聊天记录、文件和积分等数据将被永久删除，无法找回。
        </Typography.Paragraph>
        <Typography.Paragraph>
          请输入 <Typography.Text code>DELETE</Typography.Text> 确认注销：
        </Typography.Paragraph>
        <Input
          autoComplete="off"
          placeholder="请输入 DELETE"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </Modal>
    </>
  );
};

export default DeleteAccountRow;
