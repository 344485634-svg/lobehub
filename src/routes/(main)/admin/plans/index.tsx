'use client';

import { Flexbox, Input } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { App, Switch, Table, Tag } from 'antd';
import { type FC, useState } from 'react';
import { Link } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const AdminPlansPage: FC = () => {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = 20;

  const { data, isLoading, mutate } = useSWR(['admin-plans', page, search], () =>
    lambdaClient.admin.listPlans.query({ page, pageSize, search: search || undefined }),
  );

  const handleDelete = async (id: string, name: string) => {
    modal.confirm({
      content: `删除套餐"${name}"？已使用此套餐的用户不受影响。`,
      onOk: async () => {
        try {
          await lambdaClient.admin.deletePlan.mutate({ id });
          message.success('套餐已删除');
          mutate();
        } catch (e: any) {
          message.error(e?.message ?? '操作失败');
        }
      },
      title: '删除套餐',
    });
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await lambdaClient.admin.updatePlan.mutate({ active: !currentActive, id });
      message.success(currentActive ? '套餐已禁用' : '套餐已启用');
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  const columns = [
    {
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: any) => (
        <Link to={`/admin/plans/${row.id}/edit`}>
          <strong>{name}</strong>
        </Link>
      ),
      title: '套餐标识',
    },
    {
      dataIndex: 'displayName',
      key: 'displayName',
      title: '显示名称',
    },
    {
      dataIndex: 'price',
      key: 'price',
      render: (price: string, row: any) => {
        const cycle =
          row.billingCycle === 'monthly'
            ? '/月'
            : row.billingCycle === 'yearly'
              ? '/年'
              : '（终身）';
        return `¥${price}${cycle}`;
      },
      title: '价格',
    },
    {
      dataIndex: 'billingCycle',
      key: 'billingCycle',
      render: (cycle: string) => (
        <Tag>{cycle === 'monthly' ? '月付' : cycle === 'yearly' ? '年付' : '终身'}</Tag>
      ),
      title: '计费周期',
    },
    {
      dataIndex: 'quotas',
      key: 'quotas',
      render: (quotas: Record<string, number>) => {
        const entries = Object.entries(quotas || {}).slice(0, 3);
        if (entries.length === 0) return '-';
        return (
          <span style={{ fontSize: 12 }}>
            {entries.map(([k, v]) => `${k}: ${v}`).join(', ')}
            {Object.keys(quotas).length > 3 && '...'}
          </span>
        );
      },
      title: '配额',
      width: 200,
    },
    {
      dataIndex: 'active',
      key: 'active',
      render: (active: boolean, row: any) => (
        <Switch checked={active} size="small" onChange={() => handleToggleActive(row.id, active)} />
      ),
      title: '启用',
    },
    {
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      title: '排序',
      width: 80,
    },
    {
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Flexbox horizontal gap={8}>
          <Link to={`/admin/plans/${row.id}/edit`}>
            <Button size="small">编辑</Button>
          </Link>
          <Button danger size="small" onClick={() => handleDelete(row.id, row.name)}>
            删除
          </Button>
        </Flexbox>
      ),
      title: '操作',
    },
  ];

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox horizontal gap={12}>
        <Input
          placeholder="按名称或描述搜索套餐"
          style={{ maxWidth: 320 }}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <Link to="/admin/plans/create">
          <Button type="primary">创建套餐</Button>
        </Link>
      </Flexbox>
      <Table
        columns={columns}
        dataSource={data?.plans ?? []}
        loading={isLoading}
        rowKey="id"
        pagination={{
          current: page,
          onChange: setPage,
          pageSize,
          total: data?.total ?? 0,
        }}
      />
    </Flexbox>
  );
};

export default AdminPlansPage;
