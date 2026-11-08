'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Modal, Select } from '@lobehub/ui/base-ui';
import {
  App,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import { type FC, useState } from 'react';
import { Link } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const { RangePicker } = DatePicker;

const STATUS_COLOR: Record<string, string> = {
  active: 'green',
  cancelled: 'orange',
  expired: 'red',
  trial: 'blue',
};

const STATUS_LABEL: Record<string, string> = {
  active: '生效中',
  cancelled: '已取消',
  expired: '已过期',
  trial: '试用',
};

const AdminUsersPage: FC = () => {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // ── 积分调整 ──────────────────────────────────────────────────────────────
  const [creditEditUser, setCreditEditUser] = useState<any | null>(null);
  const [creditForm] = Form.useForm();
  const [creditSaving, setCreditSaving] = useState(false);

  const openCreditEditor = (row: any) => {
    setCreditEditUser(row);
    creditForm.setFieldsValue({ amount: 0, note: '' });
  };

  const handleCreditAdjust = async () => {
    if (!creditEditUser) return;
    try {
      const values = await creditForm.validateFields();
      const amount = Number(values.amount) || 0;
      if (!amount) {
        message.warning('请输入非零的积分数量');
        return;
      }
      setCreditSaving(true);
      await lambdaClient.admin.adjustUserCredits.mutate({
        amount,
        note: values.note || undefined,
        userId: creditEditUser.id,
      });
      message.success(amount > 0 ? `已为用户增加 ${amount} 积分` : `已为用户减少 ${-amount} 积分`);
      setCreditEditUser(null);
      mutate();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message ?? '调整失败');
    } finally {
      setCreditSaving(false);
    }
  };

  // ── 高级筛选 ──────────────────────────────────────────────────────────────
  const [filterForm] = Form.useForm();
  const [filterVisible, setFilterVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Record<string, any>>({});

  const applyFilter = () => {
    const values = filterForm.getFieldsValue();
    const filter: Record<string, any> = {};
    if (values.email?.trim()) filter.email = values.email.trim();
    if (values.search?.trim()) filter.search = values.search.trim();
    if (values.bannedOnly) filter.bannedOnly = true;
    if (values.hasSubscription !== undefined && values.hasSubscription !== '') {
      filter.hasSubscription = values.hasSubscription === 'yes';
    }
    if (values.planId?.trim()) filter.planId = values.planId.trim();
    if (values.dateRange?.[0]) filter.registeredFrom = values.dateRange[0].format('YYYY-MM-DD');
    if (values.dateRange?.[1]) filter.registeredTo = values.dateRange[1].format('YYYY-MM-DD');
    setActiveFilter(filter);
    setPage(1);
  };

  const resetFilter = () => {
    filterForm.resetFields();
    setActiveFilter({});
    setPage(1);
  };

  // ── 数据加载 ──────────────────────────────────────────────────────────────
  const { data, isLoading, mutate } = useSWR(
    ['admin-users-v2', page, JSON.stringify(activeFilter)],
    () =>
      lambdaClient.admin.listUsers.query({
        page,
        pageSize,
        ...activeFilter,
      }),
  );

  // ── 操作 ──────────────────────────────────────────────────────────────────
  const ban = async (userId: string) => {
    const reason = window.prompt('封禁原因（必填）：');
    if (reason === null) return;
    try {
      await lambdaClient.admin.banUser.mutate({ reason: reason || '违反使用条款', userId });
      message.success('用户已封禁');
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  const unban = async (userId: string) => {
    try {
      await lambdaClient.admin.unbanUser.mutate({ userId });
      message.success('封禁已解除');
      mutate();
    } catch (e: any) {
      message.error(e?.message ?? '操作失败');
    }
  };

  const toggleRole = async (userId: string, current: string | null) => {
    const role = current === 'admin' ? 'user' : 'admin';
    const label = role === 'admin' ? '升为管理员' : '降为普通用户';
    modal.confirm({
      content: `确认将该用户${label}？`,
      onOk: async () => {
        try {
          await lambdaClient.admin.updateUserRole.mutate({ role, userId });
          message.success('角色已更新');
          mutate();
        } catch (e: any) {
          message.error(e?.message ?? '操作失败');
        }
      },
      title: '确认修改角色',
    });
  };

  // ── 列定义 ────────────────────────────────────────────────────────────────
  const columns = [
    {
      fixed: 'left' as const,
      key: 'email',
      render: (_: unknown, row: any) => (
        <Flexbox gap={4}>
          <Link style={{ fontWeight: 500 }} to={`/admin/users/${row.id}`}>
            {row.email || row.username || row.id}
          </Link>
          {row.fullName && (
            <span style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
              {row.fullName}
            </span>
          )}
        </Flexbox>
      ),
      title: '邮箱 / 用户名',
      width: 220,
    },
    {
      key: 'role',
      render: (_: unknown, row: any) => (
        <Flexbox gap={4}>
          <Tag color={row.role === 'admin' ? 'gold' : 'default'}>
            {row.role === 'admin' ? '管理员' : '普通用户'}
          </Tag>
          {row.banned && <Tag color="red">已封禁</Tag>}
        </Flexbox>
      ),
      title: '角色 / 状态',
      width: 130,
    },
    {
      key: 'plan',
      render: (_: unknown, row: any) => {
        if (!row.planDisplayName) return <span style={{ opacity: 0.4 }}>无订阅</span>;
        return (
          <Tooltip
            title={
              row.subExpiresAt ? `到期：${dayjs(row.subExpiresAt).format('YYYY-MM-DD')}` : '长期'
            }
          >
            <Flexbox gap={4}>
              <Tag color={STATUS_COLOR[row.subStatus] || 'default'}>
                {STATUS_LABEL[row.subStatus] || row.subStatus}
              </Tag>
              <span style={{ fontSize: 12 }}>{row.planDisplayName}</span>
            </Flexbox>
          </Tooltip>
        );
      },
      title: '订阅套餐',
      width: 150,
    },
    {
      key: 'remainingCredits',
      render: (_: unknown, row: any) => {
        const total = Number(row.remainingCredits || 0);
        const plan = Number(row.planRemaining || 0);
        const topup = Number(row.topupCredits || 0);
        const reward = Number(row.rewardCredits || 0);
        if (!total && !plan && !topup && !reward) return <span style={{ opacity: 0.4 }}>-</span>;
        return (
          <Tooltip
            title={
              <div style={{ lineHeight: 1.8 }}>
                套餐剩余积分：{plan.toLocaleString()}
                <br />
                充值积分剩余：{topup.toLocaleString()}
                <br />
                赠送积分剩余：{reward.toLocaleString()}
              </div>
            }
          >
            <span style={{ color: '#1677ff', fontWeight: 700 }}>{total.toLocaleString()}</span>
            <div style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
              套餐 {plan.toLocaleString()} · 充值 {topup.toLocaleString()} · 赠送{' '}
              {reward.toLocaleString()}
            </div>
          </Tooltip>
        );
      },
      title: '剩余总积分',
      width: 170,
    },
    {
      key: 'totalSpend',
      render: (_: unknown, row: any) => {
        const v = Number(row.totalSpend || 0);
        if (!v) return <span style={{ opacity: 0.4 }}>¥0</span>;
        return <span style={{ fontWeight: 500 }}>¥{v.toFixed(2)}</span>;
      },
      title: '累计消费',
      width: 100,
    },
    {
      key: 'invite',
      render: (_: unknown, row: any) => (
        <Flexbox gap={4}>
          <span>邀请 {row.inviteCount || 0} 人</span>
          {(row.rewardCredits || 0) > 0 && (
            <span style={{ color: '#52c41a', fontSize: 12 }}>+{row.rewardCredits} 积分</span>
          )}
        </Flexbox>
      ),
      title: '推荐 / 奖励',
      width: 120,
    },
    {
      key: 'createdAt',
      render: (_: unknown, row: any) =>
        row.createdAt ? dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') : '-',
      title: '注册时间',
      width: 150,
    },
    {
      key: 'lastActiveAt',
      render: (_: unknown, row: any) => {
        if (!row.lastActiveAt) return <span style={{ opacity: 0.4 }}>从未登录</span>;
        return (
          <Tooltip title={dayjs(row.lastActiveAt).format('YYYY-MM-DD HH:mm:ss')}>
            {dayjs(row.lastActiveAt).fromNow()}
          </Tooltip>
        );
      },
      title: '最后活跃',
      width: 130,
    },
    {
      fixed: 'right' as const,
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Flexbox horizontal gap={6}>
          <Button size="small" onClick={() => openCreditEditor(row)}>
            调整积分
          </Button>
          {row.banned ? (
            <Button size="small" onClick={() => unban(row.id)}>
              解除封禁
            </Button>
          ) : (
            <Button danger size="small" onClick={() => ban(row.id)}>
              封禁
            </Button>
          )}
          <Button size="small" onClick={() => toggleRole(row.id, row.role)}>
            {row.role === 'admin' ? '降权' : '升为管理员'}
          </Button>
        </Flexbox>
      ),
      title: '操作',
      width: 250,
    },
  ];

  const activeFilterCount = Object.keys(activeFilter).length;
  const [quickSearch, setQuickSearch] = useState('');

  return (
    <Flexbox gap={16} padding={24}>
      <Flexbox horizontal gap={8} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>用户管理</div>
        <Flexbox horizontal gap={8}>
          <Input
            allowClear
            placeholder="快捷搜索邮箱 / 用户名"
            style={{ width: 240 }}
            value={quickSearch}
            onChange={(e) => {
              setQuickSearch(e.target.value);
              if (!e.target.value) {
                setActiveFilter((prev) => {
                  const n = { ...prev };
                  delete n.search;
                  return n;
                });
                setPage(1);
              }
            }}
            onPressEnter={() => {
              setActiveFilter((prev) => ({ ...prev, search: quickSearch }));
              setPage(1);
            }}
          />
          <Button
            type={activeFilterCount > 0 ? 'primary' : 'default'}
            onClick={() => setFilterVisible(!filterVisible)}
          >
            高级筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        </Flexbox>
      </Flexbox>

      {filterVisible && (
        <Card size="small" title="高级筛选">
          <Form form={filterForm} layout="vertical" onFinish={applyFilter}>
            <Row gutter={[16, 0]}>
              <Col lg={6} md={8} xs={12}>
                <Form.Item label="邮箱精确搜索" name="email">
                  <Input allowClear placeholder="输入邮箱关键词" />
                </Form.Item>
              </Col>
              <Col lg={6} md={8} xs={12}>
                <Form.Item label="用户名/邮箱模糊搜索" name="search">
                  <Input allowClear placeholder="模糊匹配" />
                </Form.Item>
              </Col>
              <Col lg={6} md={8} xs={12}>
                <Form.Item label="订阅状态" name="hasSubscription">
                  <Select
                    allowClear
                    placeholder="全部"
                    options={[
                      { label: '已订阅', value: 'yes' },
                      { label: '未订阅', value: 'no' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col lg={6} md={8} xs={12}>
                <Form.Item label="仅显示封禁用户" name="bannedOnly" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col lg={12} md={16} xs={24}>
                <Form.Item label="注册时间范围" name="dateRange">
                  <RangePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Flexbox horizontal gap={8}>
              <Button htmlType="submit" type="primary">
                应用筛选
              </Button>
              <Button onClick={resetFilter}>重置</Button>
            </Flexbox>
          </Form>
        </Card>
      )}

      <Table
        columns={columns}
        dataSource={data?.users ?? []}
        loading={isLoading}
        rowKey="id"
        scroll={{ x: 1400 }}
        size="small"
        pagination={{
          current: page,
          onChange: (p) => setPage(p),
          pageSize,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 名用户`,
          total: data?.total ?? 0,
        }}
      />

      {/* 积分调整 Modal */}
      <Modal
        confirmLoading={creditSaving}
        open={!!creditEditUser}
        title={`调整积分：${creditEditUser?.email || creditEditUser?.username || creditEditUser?.id || ''}`}
        width={480}
        onCancel={() => setCreditEditUser(null)}
        onOk={handleCreditAdjust}
      >
        <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
          正数增加积分，负数减少积分。减少时按「套餐积分 → 充值积分 → 推荐奖励积分」顺序扣除。
        </div>
        <Form form={creditForm} layout="vertical">
          <Form.Item
            label="积分数量（可为负）"
            name="amount"
            rules={[{ message: '请输入积分数量', required: true }]}
          >
            <InputNumber placeholder="例如 100 或 -50" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="备注（可选）" name="note">
            <Input placeholder="例如：手动补偿 / 违规扣除" />
          </Form.Item>
        </Form>
      </Modal>
    </Flexbox>
  );
};

export default AdminUsersPage;
