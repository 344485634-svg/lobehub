'use client';

import { Flexbox } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { App, Card, Form, Input, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useRef, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const { TextArea } = Input;

const AdminNotificationPage: FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false); // synchronous guard against double-submit
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(['admin-notifications', page], () =>
    lambdaClient.admin.adminListNotifications.query({ page, pageSize }),
  );

  const handleSend = async (values: any) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      const res = await lambdaClient.admin.adminBroadcastNotification.mutate({
        actionUrl: values.actionUrl || undefined,
        category: values.category || 'announcement',
        content: values.content,
        title: values.title,
        type: values.type || 'announcement',
      });
      message.success(`通知已发送，共推送给 ${res.sent} 名用户`);
      form.resetFields();
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '发送失败');
    } finally {
      setSending(false);
      inFlight.current = false;
    }
  };

  const columns = [
    {
      dataIndex: 'title',
      key: 'title',
      title: '标题',
    },
    {
      dataIndex: 'content',
      key: 'content',
      render: (v: string) => (
        <span style={{ opacity: 0.8 }}>{v.length > 60 ? `${v.slice(0, 60)}…` : v}</span>
      ),
      title: '内容',
    },
    {
      dataIndex: 'category',
      key: 'category',
      render: (v: string) => <Tag>{v}</Tag>,
      title: '分类',
      width: 110,
    },
    {
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
      title: '发送时间',
      width: 160,
    },
  ];

  return (
    <Flexbox gap={24} padding={24}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>通知公告</div>

      <Card size="small" title="发送新通知">
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
          发送后将推送给所有近2年内注册的用户收件箱，用户可在站内通知中心查看。
        </div>
        <Form form={form} layout="vertical" onFinish={handleSend}>
          <Form.Item
            label="通知标题"
            name="title"
            rules={[{ message: '请输入标题', required: true }]}
          >
            <Input placeholder="例如：系统维护通知" />
          </Form.Item>
          <Form.Item
            label="通知内容"
            name="content"
            rules={[{ message: '请输入内容', required: true }]}
          >
            <TextArea placeholder="详细说明…" rows={4} />
          </Form.Item>
          <Flexbox horizontal gap={16} style={{ flexWrap: 'wrap' }}>
            <Form.Item label="跳转链接（可选）" name="actionUrl" style={{ flex: 1, minWidth: 200 }}>
              <Input placeholder="https://…" />
            </Form.Item>
            <Form.Item label="分类标签（可选）" name="category" style={{ minWidth: 160 }}>
              <Input placeholder="announcement" />
            </Form.Item>
          </Flexbox>
          <Form.Item>
            <Button disabled={sending} htmlType="submit" loading={sending} type="primary">
              广播发送
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card size="small" title="历史通知">
        <Table
          columns={columns as any}
          dataSource={data?.notifications ?? []}
          loading={isLoading}
          rowKey="id"
          size="small"
          pagination={{
            current: page,
            onChange: setPage,
            pageSize,
            showTotal: (t) => `共 ${t} 条`,
            total: data?.total ?? 0,
          }}
        />
      </Card>
    </Flexbox>
  );
};

export default AdminNotificationPage;
