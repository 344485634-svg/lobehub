'use client';

import { Flexbox, Input, TextArea } from '@lobehub/ui';
import { Button, Modal, Select } from '@lobehub/ui/base-ui';
import { App, Form, Table, Tag, Upload } from 'antd';
import dayjs from 'dayjs';
import { sha256 } from 'js-sha256';
import { type FC, useState } from 'react';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';
import { uploadService } from '@/services/upload';

const AdminSkillsPage: FC = () => {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'builtin' | 'market' | 'user' | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(['admin-skills', page, search, sourceFilter], () =>
    lambdaClient.admin.listAllSkills.query({
      page,
      pageSize,
      search: search || undefined,
      source: sourceFilter,
    }),
  );

  const deleteSkill = async (id: string, name: string) => {
    modal.confirm({
      content: `删除技能「${name}」？此操作不可撤销。`,
      onOk: async () => {
        try {
          const res = await lambdaClient.admin.deleteSkill.mutate({ id });
          if (res.success) {
            message.success('技能已删除');
            mutate();
          } else {
            message.warning('技能未找到');
          }
        } catch (e: any) {
          message.error(e?.message ?? '操作失败');
        }
      },
      title: '删除技能',
    });
  };

  const handleCreate = async (values: any) => {
    try {
      await lambdaClient.admin.createSkill.mutate({
        content: values.content,
        description: values.description,
        name: values.name,
      });
      message.success('技能创建成功');
      setCreateOpen(false);
      form.resetFields();
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '创建失败');
    }
  };

  const handleUploadZip = async (file: File) => {
    setUploading(true);
    try {
      const { data: metadata } = await uploadService.uploadFileToS3(file, {
        directory: 'skills',
      });
      const hash = sha256(await file.arrayBuffer());
      const result = await lambdaClient.file.createFile.mutate({
        fileType: file.type || 'application/zip',
        hash,
        metadata: {},
        name: file.name,
        size: file.size,
        url: metadata.path,
      });
      await lambdaClient.admin.importSkillFromZip.mutate({ zipFileId: result.id });
      message.success('技能包导入成功');
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '导入失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const columns = [
    {
      dataIndex: 'name',
      key: 'name',
      title: '名称',
    },
    {
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => (
        <span style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
          {desc?.slice(0, 80)}
          {desc?.length > 80 ? '…' : ''}
        </span>
      ),
      title: '描述',
    },
    {
      dataIndex: 'source',
      key: 'source',
      render: (source: string) => {
        const color = source === 'builtin' ? 'blue' : source === 'market' ? 'green' : 'default';
        const text =
          source === 'builtin'
            ? '内置'
            : source === 'market'
              ? '市场'
              : source === 'user'
                ? '开发者'
                : source;
        return <Tag color={color}>{text}</Tag>;
      },
      title: '来源',
    },
    {
      dataIndex: 'identifier',
      key: 'identifier',
      render: (id: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{id}</span>,
      title: '标识',
    },
    {
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm'),
      title: '更新时间',
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Button danger size="small" onClick={() => deleteSkill(row.id, row.name)}>
          删除
        </Button>
      ),
      title: '操作',
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox>
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13 }}>
          上传/管理开发者技能包。技能发布后，前端用户可在对话中调用。
        </div>
      </Flexbox>

      <Flexbox horizontal gap={12} wrap="wrap">
        <Input
          placeholder="按名称或描述搜索"
          style={{ maxWidth: 280 }}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Select
          allowClear
          placeholder="来源"
          style={{ width: 140 }}
          value={sourceFilter}
          options={[
            { label: '内置', value: 'builtin' },
            { label: '市场', value: 'market' },
            { label: '开发者', value: 'user' },
          ]}
          onChange={(val) => {
            setSourceFilter((val as any) ?? undefined);
            setPage(1);
          }}
        />
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          新建技能
        </Button>
        <Upload
          accept=".zip,.skill"
          disabled={uploading}
          showUploadList={false}
          beforeUpload={(file) => {
            handleUploadZip(file);
            return false;
          }}
        >
          <Button loading={uploading}>{uploading ? '上传中…' : '上传技能包 (.zip)'}</Button>
        </Upload>
      </Flexbox>

      <Table
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading}
        rowKey="id"
        pagination={{
          current: page,
          onChange: setPage,
          pageSize,
          total: data?.total ?? 0,
        }}
      />

      <Modal
        open={createOpen}
        title="新建技能"
        onOk={() => form.submit()}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item label="名称" name="name" rules={[{ message: '必填', required: true }]}>
            <Input placeholder="例如：文档摘要助手" />
          </Form.Item>
          <Form.Item label="描述" name="description" rules={[{ message: '必填', required: true }]}>
            <Input placeholder="简要说明技能用途" />
          </Form.Item>
          <Form.Item
            label="技能内容 (SKILL.md / 提示词)"
            name="content"
            rules={[{ message: '必填', required: true }]}
          >
            <TextArea placeholder="写入技能的系统提示词或 SKILL.md 正文" rows={10} />
          </Form.Item>
        </Form>
      </Modal>
    </Flexbox>
  );
};

export default AdminSkillsPage;
