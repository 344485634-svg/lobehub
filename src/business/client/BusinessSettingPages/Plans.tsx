'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Modal, Segmented } from '@lobehub/ui/base-ui';
import { App, Card, Col, Empty, QRCode, Row, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const cycleLabel = (c: string) =>
  c === 'monthly' ? '月付' : c === 'yearly' ? '年付' : c === 'lifetime' ? '终身' : c;

const PlansPage: FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [channel, setChannel] = useState<'alipay' | 'wechat'>('alipay');
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<{
    outTradeNo: string;
    payUrl?: string | null;
    qrCode?: string | null;
  } | null>(null);

  const { data: plans, isLoading } = useSWR('user-plans', () =>
    lambdaClient.subscription.listPlans.query(),
  );

  const { data: mine, mutate: mutateMine } = useSWR('my-subscription', () =>
    lambdaClient.subscription.mySubscription.query(),
  );

  const outTradeNoFromUrl = searchParams.get('outTradeNo');

  useEffect(() => {
    if (outTradeNoFromUrl) {
      setPayModal({ outTradeNo: outTradeNoFromUrl });
    }
  }, [outTradeNoFromUrl]);

  const { data: orderStatus } = useSWR(
    payModal?.outTradeNo ? ['pay-order', payModal.outTradeNo] : null,
    () =>
      lambdaClient.subscription.getOrder.query({
        mockPay: false,
        outTradeNo: payModal!.outTradeNo,
      }),
    { refreshInterval: payModal ? 2500 : 0 },
  );

  useEffect(() => {
    if (orderStatus?.status === 'paid') {
      message.success('支付成功，套餐已开通');
      setPayModal(null);
      setPayingPlanId(null);
      mutateMine();
      if (searchParams.has('outTradeNo')) {
        searchParams.delete('outTradeNo');
        searchParams.delete('mock');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [orderStatus?.status]);

  const currentPlanId = mine?.subscription?.planId;

  const sortedPlans = useMemo(
    () => [...(plans || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [plans],
  );

  const handleBuy = async (planId: string) => {
    setPayingPlanId(planId);
    try {
      const res = await lambdaClient.subscription.createOrder.mutate({
        channel,
        planId,
      });

      if (res.freeActivated) {
        message.success('已开通免费套餐');
        mutateMine();
        setPayingPlanId(null);
        return;
      }

      if (res.payUrl && !res.qrCode) {
        window.location.href = res.payUrl;
        return;
      }

      setPayModal({
        outTradeNo: res.outTradeNo!,
        payUrl: res.payUrl,
        qrCode: res.qrCode,
      });
    } catch (e: any) {
      message.error(e?.message ?? '创建订单失败');
      setPayingPlanId(null);
    }
  };

  const handleMockPay = async () => {
    if (!payModal?.outTradeNo) return;
    try {
      await lambdaClient.subscription.getOrder.query({
        mockPay: true,
        outTradeNo: payModal.outTradeNo,
      });
      message.success('模拟支付成功');
      mutateMine();
      setPayModal(null);
      setPayingPlanId(null);
    } catch (e: any) {
      message.error(e?.message ?? '模拟支付失败');
    }
  };

  return (
    <Flexbox gap={20} padding={24}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>订阅套餐</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', marginTop: 4 }}>
          选择适合你的方案，支付成功后自动开通模型使用权
        </div>
      </div>

      <Card size="small" title="当前订阅">
        {mine?.subscription && mine.plan ? (
          <Flexbox gap={8}>
            <div>
              套餐：<strong>{mine.plan.displayName}</strong>{' '}
              <Tag color="green">
                {mine.subscription.status === 'active' ? '生效中' : mine.subscription.status}
              </Tag>
            </div>
            <div>开始：{dayjs(mine.subscription.startedAt).format('YYYY-MM-DD HH:mm')}</div>
            <div>
              到期：
              {mine.subscription.expiresAt
                ? dayjs(mine.subscription.expiresAt).format('YYYY-MM-DD HH:mm')
                : '终身'}
            </div>
          </Flexbox>
        ) : (
          <div style={{ color: 'var(--lobe-color-text-secondary)' }}>
            暂无生效中的订阅，请选择下方套餐开通
          </div>
        )}
      </Card>

      <Flexbox horizontal gap={8}>
        <span style={{ lineHeight: '32px' }}>支付方式：</span>
        <Segmented
          value={channel}
          options={[
            { label: '支付宝', value: 'alipay' },
            { label: '微信支付', value: 'wechat' },
          ]}
          onChange={(v) => setChannel(v as 'alipay' | 'wechat')}
        />
      </Flexbox>

      {isLoading ? (
        <div>加载中…</div>
      ) : !sortedPlans.length ? (
        <Empty description="暂无可购买套餐，请联系管理员在后台创建" />
      ) : (
        <Row gutter={[16, 16]}>
          {sortedPlans.map((plan) => {
            const quotas = (plan.quotas || {}) as Record<string, number>;
            const isCurrent = currentPlanId === plan.id;
            return (
              <Col key={plan.id} md={8} sm={12} xs={24}>
                <Card
                  style={{
                    borderColor: isCurrent ? 'var(--lobe-color-primary)' : undefined,
                    height: '100%',
                  }}
                  title={
                    <Flexbox horizontal align="center" gap={8} justify="space-between">
                      <span>{plan.displayName}</span>
                      {isCurrent && <Tag color="blue">当前</Tag>}
                    </Flexbox>
                  }
                >
                  <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
                    ¥{plan.price}
                    <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.65 }}>
                      /{cycleLabel(plan.billingCycle)}
                    </span>
                  </div>
                  {plan.description && (
                    <div
                      style={{
                        color: 'var(--lobe-color-text-secondary)',
                        fontSize: 13,
                        marginBottom: 12,
                        minHeight: 40,
                      }}
                    >
                      {plan.description}
                    </div>
                  )}
                  <Flexbox gap={4} style={{ fontSize: 13, marginBottom: 16 }}>
                    {quotas.chatMessages != null && <div>聊天：{quotas.chatMessages}/月</div>}
                    {quotas.imageGenerations != null && (
                      <div>图片：{quotas.imageGenerations}/月</div>
                    )}
                    {quotas.videoGenerations != null && (
                      <div>视频：{quotas.videoGenerations}/月</div>
                    )}
                    {quotas.apiCalls != null && <div>API：{quotas.apiCalls}/月</div>}
                  </Flexbox>
                  <Button
                    block
                    disabled={isCurrent}
                    loading={payingPlanId === plan.id}
                    type="primary"
                    onClick={() => handleBuy(plan.id)}
                  >
                    {Number(plan.price) === 0
                      ? isCurrent
                        ? '已开通'
                        : '免费开通'
                      : isCurrent
                        ? '已订阅'
                        : '立即订阅'}
                  </Button>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal
        footer={null}
        open={!!payModal}
        title="扫码支付"
        onCancel={() => {
          setPayModal(null);
          setPayingPlanId(null);
        }}
      >
        <Flexbox align="center" gap={16} style={{ padding: 12 }}>
          {payModal?.qrCode ? (
            <QRCode errorLevel="M" size={200} value={payModal.qrCode} />
          ) : (
            <div style={{ color: 'var(--lobe-color-text-secondary)' }}>
              等待支付信息…
              {payModal?.payUrl && (
                <div style={{ marginTop: 8 }}>
                  <a href={payModal.payUrl} rel="noreferrer" target="_blank">
                    打开支付页面
                  </a>
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            订单号：{payModal?.outTradeNo}
            <br />
            状态：{orderStatus?.status || 'pending'}（支付完成后自动开通）
          </div>
          <Button onClick={handleMockPay}>沙箱模拟支付成功</Button>
        </Flexbox>
      </Modal>
    </Flexbox>
  );
};

export default PlansPage;
