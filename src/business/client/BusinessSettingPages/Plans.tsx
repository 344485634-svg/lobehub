'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Modal, Segmented } from '@lobehub/ui/base-ui';
import { App, Card, Col, Empty, QRCode, Row, Tag } from 'antd';
import dayjs from 'dayjs';
import { type FC, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const PlansPage: FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
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
    if (outTradeNoFromUrl) setPayModal({ outTradeNo: outTradeNoFromUrl });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderStatus?.status]);

  const currentPlanId = mine?.subscription?.planId;
  const sortedPlans = useMemo(
    () => [...(plans || [])].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [plans],
  );

  const priceOf = (plan: any) => {
    if (cycle === 'yearly') {
      return {
        original: plan.yearlyOriginalPrice,
        price: plan.yearlyPrice || plan.price,
      };
    }
    return {
      original: plan.monthlyOriginalPrice,
      price: plan.monthlyPrice || plan.price,
    };
  };

  const discountPercent = (original?: string | null, price?: string | null) => {
    const o = Number(original);
    const p = Number(price);
    if (!o || !p || o <= p) return null;
    return Math.round((1 - p / o) * 100);
  };

  const handleBuy = async (planId: string) => {
    setPayingPlanId(planId);
    try {
      const res = await lambdaClient.subscription.createOrder.mutate({
        billingCycle: cycle,
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
        <div style={{ fontSize: 22, fontWeight: 700 }}>选择适合你的套餐</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', marginTop: 6 }}>
          年付更划算 · 积分点随套餐到账 · 按模型精准扣费
        </div>
      </div>

      <Card size="small" title="当前订阅">
        {mine?.subscription && mine.plan ? (
          <Flexbox gap={6}>
            <div>
              套餐：<strong>{mine.plan.displayName}</strong>{' '}
              <Tag color="green">
                {mine.subscription.status === 'active' ? '生效中' : mine.subscription.status}
              </Tag>
            </div>
            <div>积分：{(mine.plan as any).credits ?? mine.plan.quotas?.credits ?? '-'} 点</div>
            <div>开始：{dayjs(mine.subscription.startedAt).format('YYYY-MM-DD')}</div>
            <div>
              到期：
              {mine.subscription.expiresAt
                ? dayjs(mine.subscription.expiresAt).format('YYYY-MM-DD')
                : '终身'}
            </div>
          </Flexbox>
        ) : (
          <div style={{ color: 'var(--lobe-color-text-secondary)' }}>
            暂无生效中的订阅，开通后即可使用对应模型
          </div>
        )}
      </Card>

      <Flexbox horizontal gap={16} style={{ flexWrap: 'wrap' }}>
        <Segmented
          value={cycle}
          options={[
            { label: '月付', value: 'monthly' },
            { label: '年付（更优惠）', value: 'yearly' },
          ]}
          onChange={(v) => setCycle(v as 'monthly' | 'yearly')}
        />
        <Segmented
          value={channel}
          options={[
            { label: '支付宝', value: 'alipay' },
            { label: '微信', value: 'wechat' },
          ]}
          onChange={(v) => setChannel(v as 'alipay' | 'wechat')}
        />
      </Flexbox>

      {isLoading ? (
        <div>加载中…</div>
      ) : !sortedPlans.length ? (
        <Empty description="暂无可购买套餐" />
      ) : (
        <Row gutter={[16, 16]}>
          {sortedPlans.map((plan: any) => {
            const { price, original } = priceOf(plan);
            const off = discountPercent(original, price);
            const isCurrent = currentPlanId === plan.id;
            const benefits: string[] = Array.isArray(plan.benefits) ? plan.benefits : [];
            const models: any[] = Array.isArray(plan.allowedModels) ? plan.allowedModels : [];
            const credits = plan.credits ?? plan.quotas?.credits ?? 0;
            return (
              <Col key={plan.id} lg={8} md={12} xs={24}>
                <Card
                  style={{
                    borderColor:
                      plan.highlight || isCurrent ? 'var(--lobe-color-primary)' : undefined,
                    boxShadow: plan.highlight ? '0 8px 24px rgba(0,0,0,0.08)' : undefined,
                    height: '100%',
                    position: 'relative',
                  }}
                >
                  {(plan.badge || plan.highlight) && (
                    <Tag color="gold" style={{ position: 'absolute', right: 12, top: 12 }}>
                      {plan.badge || '推荐'}
                    </Tag>
                  )}
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                    {plan.displayName}
                  </div>
                  {plan.description && (
                    <div
                      style={{
                        color: 'var(--lobe-color-text-secondary)',
                        fontSize: 13,
                        marginBottom: 12,
                        minHeight: 36,
                      }}
                    >
                      {plan.description}
                    </div>
                  )}

                  <div style={{ alignItems: 'baseline', display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{ color: 'var(--lobe-color-primary)', fontSize: 32, fontWeight: 800 }}
                    >
                      ¥{price}
                    </span>
                    <span style={{ opacity: 0.65 }}>/{cycle === 'yearly' ? '年' : '月'}</span>
                  </div>
                  {original && Number(original) > Number(price) && (
                    <div style={{ marginBottom: 8 }}>
                      <span
                        style={{
                          marginRight: 8,
                          opacity: 0.5,
                          textDecoration: 'line-through',
                        }}
                      >
                        原价 ¥{original}
                      </span>
                      {off != null && <Tag color="red">省 {off}%</Tag>}
                    </div>
                  )}

                  <div
                    style={{
                      background: 'rgba(22,119,255,0.06)',
                      borderRadius: 8,
                      fontWeight: 600,
                      marginBottom: 12,
                      padding: '8px 12px',
                    }}
                  >
                    含{' '}
                    <span style={{ color: 'var(--lobe-color-primary)', fontSize: 20 }}>
                      {credits}
                    </span>{' '}
                    积分点
                    {cycle === 'yearly' && (
                      <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>
                        /年
                      </span>
                    )}
                  </div>

                  <Flexbox gap={6} style={{ fontSize: 13, marginBottom: 12, minHeight: 72 }}>
                    {benefits.length ? (
                      benefits.map((b) => <div key={b}>✓ {b}</div>)
                    ) : (
                      <div style={{ opacity: 0.5 }}>权益以开通后实际权限为准</div>
                    )}
                  </Flexbox>

                  <div style={{ fontSize: 13, marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>可用模型</div>
                    <Flexbox gap={6}>
                      {models.length ? (
                        models.map((m) => (
                          <div key={`${m.providerId}-${m.modelId}`}>
                            ✓ {m.displayName || m.modelId}
                          </div>
                        ))
                      ) : (
                        <div style={{ opacity: 0.5 }}>暂未配置可用模型</div>
                      )}
                    </Flexbox>
                  </div>

                  <Button
                    block
                    disabled={isCurrent}
                    loading={payingPlanId === plan.id}
                    type="primary"
                    onClick={() => handleBuy(plan.id)}
                  >
                    {Number(price) === 0
                      ? isCurrent
                        ? '已开通'
                        : '免费开通'
                      : isCurrent
                        ? '当前方案'
                        : cycle === 'yearly'
                          ? '年付订阅'
                          : '月付订阅'}
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
            状态：{orderStatus?.status || 'pending'}
          </div>
          <Button onClick={handleMockPay}>沙箱模拟支付成功</Button>
        </Flexbox>
      </Modal>
    </Flexbox>
  );
};

export default PlansPage;
