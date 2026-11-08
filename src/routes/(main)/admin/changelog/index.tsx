'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Modal } from '@lobehub/ui/base-ui';
import { App, Card, DatePicker, Form, Input, Popconfirm, Table } from 'antd';
import dayjs from 'dayjs';
import { type FC, useRef, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const { TextArea } = Input;

type Entry = {
  content: string;
  date: string;
  id: string;
  image?: string;
  title: string;
  versionRange?: string[];
};

const genId = () => `log-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

const AdminChangelogPage: FC = () => {
  const { message } = App.useApp();
  const { data, isLoading, mutate } = useSWR('admin-changelog-config', () =>
    lambdaClient.admin.getChangelogConfig.query(),
  );
  const [editing, setEditing] = useState<Entry | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const listRef = useRef<Entry[]>([]);

  listRef.current = data?.entries ?? [];

  const openCreate = () => {
    setEditing({ content: '', date: dayjs().format('YYYY-MM-DD'), id: genId(), title: '' });
    setCreating(true);
    form.resetFields();
  };

  const openEdit = (entry: Entry) => {
    setEditing(entry);
    setCreating(true);
    form.setFieldsValue({
      content: entry.content,
      date: dayjs(entry.date),
      id: entry.id,
      image: entry.image,
      title: entry.title,
      versionRange: entry.versionRange?.join(' ~ '),
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const entry: Entry = {
        content: values.content,
        date: values.date ? values.date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        id: editing.id,
        image: values.image || undefined,
        title: values.title,
        versionRange: values.versionRange
          ? String(values.versionRange)
              .split(/[~～]/)
              .map((s: string) => s.trim())
              .filter(Boolean)
          : undefined,
      };
      const exists = listRef.current.some((e) => e.id === entry.id && e.id !== editing.id);
      if (exists) {
        message.error('条目 ID 已存在');
        return;
      }
      const entries = [...listRef.current.filter((e) => e.id !== entry.id), entry];
      await lambdaClient.admin.setChangelogConfig.mutate({ entries });
      message.success('更新日志已保存');
      setCreating(false);
      setEditing(null);
      mutate();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const entries = listRef.current.filter((e) => e.id !== id);
    await lambdaClient.admin.setChangelogConfig.mutate({ entries });
    message.success('条目已删除');
    mutate();
  };

  const columns = [
    { dataIndex: 'date', key: 'date', title: '日期', width: 120 },
    { dataIndex: 'title', key: 'title', title: '标题' },
    {
      dataIndex: 'content',
      key: 'content',
      render: (v: string) => (
        <span style={{ opacity: 0.8 }}>{v.length > 60 ? `${v.slice(0, 60)}…` : v}</span>
      ),
      title: '内容',
    },
    {
      dataIndex: 'versionRange',
      key: 'versionRange',
      render: (v?: string[]) => (v?.length ? v.join(' ~ ') : '-'),
      title: '版本',
      width: 140,
    },
    {
      key: 'actions',
      render: (_: unknown, row: Entry) => (
        <Flexbox horizontal gap={6}>
          <Button size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Popconfirm
            cancelText="取消"
            okText="删除"
            title="确认删除该条更新日志？"
            onConfirm={() => handleDelete(row.id)}
          >
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Flexbox>
      ),
      title: '操作',
      width: 140,
    },
  ];

  return (
    <Flexbox gap={24} padding={24}>
      <Flexbox
        horizontal
        gap={16}
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div style={{ fontSize: 22, fontWeight: 700 }}>更新日志配置</div>
        <Button type="primary" onClick={openCreate}>
          新增条目
        </Button>
      </Flexbox>

      <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13 }}>
        管理员在此维护的更新日志将展示给所有用户（首页左下角「? →
        更新日志」）。未配置时回退到官方版本历史。
      </div>

      <Card loading={isLoading} size="small" title="更新日志条目">
        <Table
          columns={columns as any}
          dataSource={listRef.current}
          locale={{ emptyText: '暂无更新日志条目，点击右上角「新增条目」添加' }}
          rowKey="id"
          size="small"
        />
      </Card>

      <Modal
        confirmLoading={saving}
        open={creating}
        title={editing?.title ? '编辑更新日志' : '新增更新日志'}
        width={640}
        onOk={handleSave}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="标题" name="title" rules={[{ message: '请输入标题', required: true }]}>
            <Input placeholder="例如：v2.3.0 发布" />
          </Form.Item>
          <Form.Item label="日期" name="date" rules={[{ message: '请选择日期', required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="版本号（可选）" name="versionRange">
            <Input placeholder="例如：2.3.0 ~ 2.3.1，多个版本用 ~ 分隔" />
          </Form.Item>
          <Form.Item label="封面图 URL（可选）" name="image">
            <Input placeholder="https://…" />
          </Form.Item>
          <Form.Item
            label="内容（支持 Markdown）"
            name="content"
            rules={[{ message: '请输入内容', required: true }]}
          >
            <TextArea placeholder="描述本次更新的内容…" rows={6} />
          </Form.Item>
        </Form>
      </Modal>
    </Flexbox>
  );
};

export default AdminChangelogPage;
