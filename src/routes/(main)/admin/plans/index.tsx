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
          {row.badge ? (
            <Tag color="gold" style={{ marginLeft: 8 }}>
              {row.badge}
            </Tag>
          ) : null}
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
      key: 'pricing',
      render: (_: unknown, row: any) => (
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>
            月：
            {row.monthlyOriginalPrice && (
              <span style={{ marginRight: 4, opacity: 0.5, textDecoration: 'line-through' }}>
                ¥{row.monthlyOriginalPrice}
              </span>
            )}
            <strong>¥{row.monthlyPrice || row.price}</strong>
          </div>
          <div>
            年：
            {row.yearlyOriginalPrice && (
              <span style={{ marginRight: 4, opacity: 0.5, textDecoration: 'line-through' }}>
                ¥{row.yearlyOriginalPrice}
              </span>
            )}
            <strong>¥{row.yearlyPrice || '-'}</strong>
          </div>
        </div>
      ),
      title: '价格',
      width: 160,
    },
    {
      dataIndex: 'credits',
      key: 'credits',
      render: (c: number) => (c != null ? `${c} 积分` : '-'),
      title: '积分',
      width: 100,
    },
    {
      dataIndex: 'benefits',
      key: 'benefits',
      render: (benefits: string[]) => {
        if (!Array.isArray(benefits) || !benefits.length) return '-';
        return (
          <span style={{ fontSize: 12 }}>
            {benefits.slice(0, 2).join('；')}
            {benefits.length > 2 ? '…' : ''}
          </span>
        );
      },
      title: '权益',
      width: 200,
    },
    {
      dataIndex: 'allowedModels',
      key: 'allowedModels',
      render: (models: any[]) => (Array.isArray(models) ? `${models.length} 个模型` : '0 个模型'),
      title: '可用模型',
      width: 100,
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
