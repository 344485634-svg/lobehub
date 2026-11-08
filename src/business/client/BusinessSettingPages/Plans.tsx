'use client';

import { AlipayCircleFilled, LoadingOutlined, WechatFilled } from '@ant-design/icons';
import { PLAN_ALLOWED_MODELS_ENABLED } from '@lobechat/business-const';
import { Flexbox } from '@lobehub/ui';
import { Button, Modal, Segmented } from '@lobehub/ui/base-ui';
import { App, Card, Col, Empty, Input, QRCode, Row, Spin, Tag } from 'antd';
import dayjs from 'dayjs';
import { type CSSProperties, type FC, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const ALIPAY_BLUE = '#1677FF';
const WECHAT_GREEN = '#07C160';

const payMethodCardStyle = (disabled: boolean): CSSProperties => ({
  alignItems: 'center',
  background: 'var(--lobe-color-fill-quaternary, rgba(0,0,0,0.02))',
  border: '1px solid var(--lobe-color-border-secondary, rgba(0,0,0,0.06))',
  borderRadius: 14,
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  gap: 10,
  justifyContent: 'center',
  minHeight: 132,
  minWidth: 140,
  opacity: disabled ? 0.55 : 1,
  padding: '20px 16px',
  transition: 'border-color .15s ease, box-shadow .15s ease, transform .15s ease',
  userSelect: 'none',
});

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: '生效中',
  cancelled: '已取消',
  expired: '已过期',
  trial: '试用中',
};

/**
 * Resolve subscription display status. Treats an active subscription whose
 * expiresAt has passed as expired too — belt and braces on top of the
 * server-side lazy expiry, in case the status column hasn't been flipped yet.
 */
const getSubscriptionStatus = (
  status: string,
  expiresAt?: string | Date | null,
): { color: string; label: string } => {
  const isPastDue = status === 'active' && !!expiresAt && dayjs(expiresAt).isBefore(dayjs());
  if (isPastDue || status === 'expired') return { color: 'red', label: '已过期' };
  if (status === 'cancelled') return { color: 'default', label: '已取消' };
  return { color: 'green', label: SUBSCRIPTION_STATUS_LABELS[status] ?? status };
};

const PlansPage: FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [pendingChannel, setPendingChannel] = useState<'alipay' | 'wechat' | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponPreview, setCouponPreview] = useState<{
    discountAmount: number;
    finalAmount: number;
    name: string;
    originalAmount: number;
    ticket?: string;
  } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [payModal, setPayModal] = useState<{
    channel?: 'alipay' | 'wechat';
    outTradeNo?: string | null;
    payUrl?: string | null;
    planId: string;
    qrCode?: string | null;
    step: 'select' | 'qr';
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
      setPayModal({
        outTradeNo: outTradeNoFromUrl,
        planId: '',
        step: 'qr',
      });
    }
  }, [outTradeNoFromUrl]);

  const { data: orderStatus } = useSWR(
    payModal?.step === 'qr' && payModal.outTradeNo ? ['pay-order', payModal.outTradeNo] : null,
    () =>
      lambdaClient.subscription.getOrder.query({
        outTradeNo: payModal!.outTradeNo!,
      }),
    { refreshInterval: payModal?.step === 'qr' && payModal.outTradeNo ? 2500 : 0 },
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
    const plan = sortedPlans.find((p: any) => p.id === planId);
    const { price } = priceOf(plan || {});
    // 免费套餐直接开通，不走支付渠道选择
    if (Number(price) === 0) {
      setPayingPlanId(planId);
      try {
        const res = await lambdaClient.subscription.createOrder.mutate({
          billingCycle: cycle,
          channel: 'alipay',
          planId,
        });
        if (res.freeActivated) {
          message.success('已开通免费套餐');
          mutateMine();
        }
      } catch (e: any) {
        message.error(e?.message ?? '开通失败');
      } finally {
        setPayingPlanId(null);
      }
      return;
    }

    setPayingPlanId(planId);
    setCouponCode('');
    setCouponPreview(null);
    setPayModal({ planId, step: 'select' });
  };

  const handleSelectChannel = async (channel: 'alipay' | 'wechat') => {
    if (!payModal?.planId || creatingOrder) return;
    setCreatingOrder(true);
    setPendingChannel(channel);
    try {
      const res = await (lambdaClient.subscription.createOrder as any).mutate({
        billingCycle: cycle,
        channel,
        couponCode: couponCode.trim() || undefined,
        couponTicket: couponPreview?.ticket,
        planId: payModal.planId,
      });
      if (res.freeActivated) {
        message.success('已开通免费套餐');
        mutateMine();
        setPayModal(null);
        setPayingPlanId(null);
        return;
      }
      if (res.payUrl && !res.qrCode) {
        window.location.href = res.payUrl;
        return;
      }
      setPayModal({
        channel,
        outTradeNo: res.outTradeNo!,
        payUrl: res.payUrl,
        planId: payModal.planId,
        qrCode: res.qrCode,
        step: 'qr',
      });
    } catch (e: any) {
      message.error(e?.message ?? '创建订单失败');
      setPayModal(null);
      setPayingPlanId(null);
    } finally {
      setCreatingOrder(false);
      setPendingChannel(null);
    }
  };

  const handleApplyCoupon = async () => {
    if (!payModal?.planId || !couponCode.trim()) {
      message.warning('请输入优惠码');
      return;
    }
    const plan = sortedPlans.find((p: any) => p.id === payModal.planId);
    if (!plan) return;
    const { price } = priceOf(plan);
    setCouponChecking(true);
    try {
      const preview = await lambdaClient.spend.previewCoupon.mutate({
        amountCny: Number(price),
        code: couponCode.trim(),
        scope: 'subscription',
      });
      setCouponPreview({
        discountAmount: preview.discountAmount,
        finalAmount: preview.finalAmount,
        name: preview.name,
        originalAmount: preview.originalAmount,
        ticket: preview.ticket,
      });
      message.success(`已应用「${preview.name}」，应付 ¥${preview.finalAmount.toFixed(2)}`);
    } catch (e: any) {
      setCouponPreview(null);
      message.error(e?.message || '优惠码无效');
    } finally {
      setCouponChecking(false);
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
              {(() => {
                const { color, label } = getSubscriptionStatus(
                  mine.subscription.status,
                  mine.subscription.expiresAt,
                );
                return <Tag color={color}>{label}</Tag>;
              })()}
            </div>
            <div>
              积分：
              {(mine.plan as { credits?: number }).credits ??
                (mine.plan as { quotas?: { credits?: number } }).quotas?.credits ??
                '-'}{' '}
              点
            </div>
            <div>开始：{dayjs(mine.subscription.startedAt).format('YYYY-MM-DD')}</div>
            <div>
              到期：
              {mine.subscription.expiresAt
                ? dayjs(mine.subscription.expiresAt).format('YYYY-MM-DD')
                : '终身'}
            </div>
          </Flexbox>
        ) : mine?.lastExpiredSubscription ? (
          <Flexbox gap={6}>
            <div>
              上次套餐：<strong>{mine.lastExpiredPlan?.displayName ?? '-'}</strong>{' '}
              <Tag color="red">已过期</Tag>
            </div>
            {mine.lastExpiredSubscription.expiresAt && (
              <div>
                过期时间：
                {dayjs(mine.lastExpiredSubscription.expiresAt).format('YYYY-MM-DD')}
              </div>
            )}
            <div style={{ color: 'var(--lobe-color-text-secondary)' }}>
              套餐已过期，可在下方选择新套餐重新订阅
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

                  {PLAN_ALLOWED_MODELS_ENABLED && (
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
                  )}

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
        title={payModal?.step === 'select' ? '选择支付方式' : '扫码支付'}
        onCancel={() => {
          if (creatingOrder) return;
          setPayModal(null);
          setPayingPlanId(null);
          setPendingChannel(null);
        }}
      >
        <Flexbox align="center" gap={16} style={{ padding: 12 }}>
          {payModal?.step === 'select' ? (
            <>
              <div
                style={{
                  color: 'var(--lobe-color-text-secondary)',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                请选择支付方式，系统将生成对应二维码
              </div>
              <Flexbox gap={8} style={{ width: '100%' }}>
                <Flexbox horizontal gap={8} style={{ width: '100%' }}>
                  <Input
                    allowClear
                    disabled={creatingOrder}
                    placeholder="优惠码（可选）"
                    style={{ flex: 1, textTransform: 'uppercase' }}
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value.toUpperCase());
                      setCouponPreview(null);
                    }}
                  />
                  <Button
                    disabled={creatingOrder}
                    loading={couponChecking}
                    onClick={handleApplyCoupon}
                  >
                    使用
                  </Button>
                </Flexbox>
                {couponPreview && (
                  <div style={{ fontSize: 12, textAlign: 'center' }}>
                    原价 ¥{couponPreview.originalAmount.toFixed(2)} − 优惠 ¥
                    {couponPreview.discountAmount.toFixed(2)} ={' '}
                    <strong>应付 ¥{couponPreview.finalAmount.toFixed(2)}</strong>
                  </div>
                )}
              </Flexbox>
              <Flexbox
                horizontal
                gap={14}
                style={{ flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}
              >
                <div
                  aria-disabled={creatingOrder}
                  role="button"
                  style={payMethodCardStyle(creatingOrder)}
                  tabIndex={0}
                  onClick={() => handleSelectChannel('alipay')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleSelectChannel('alipay');
                  }}
                  onMouseEnter={(e) => {
                    if (creatingOrder) return;
                    const el = e.currentTarget;
                    el.style.borderColor = ALIPAY_BLUE;
                    el.style.boxShadow = `0 8px 24px ${ALIPAY_BLUE}22`;
                    el.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.style.borderColor = 'var(--lobe-color-border-secondary, rgba(0,0,0,0.06))';
                    el.style.boxShadow = 'none';
                    el.style.transform = 'none';
                  }}
                >
                  {pendingChannel === 'alipay' ? (
                    <Spin
                      indicator={
                        <LoadingOutlined spin style={{ color: ALIPAY_BLUE, fontSize: 36 }} />
                      }
                    />
                  ) : (
                    <AlipayCircleFilled style={{ color: ALIPAY_BLUE, fontSize: 48 }} />
                  )}
                  <div style={{ fontSize: 15, fontWeight: 600 }}>支付宝</div>
                  <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
                    Alipay
                  </div>
                </div>

                <div
                  aria-disabled={creatingOrder}
                  role="button"
                  style={payMethodCardStyle(creatingOrder)}
                  tabIndex={0}
                  onClick={() => handleSelectChannel('wechat')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleSelectChannel('wechat');
                  }}
                  onMouseEnter={(e) => {
                    if (creatingOrder) return;
                    const el = e.currentTarget;
                    el.style.borderColor = WECHAT_GREEN;
                    el.style.boxShadow = `0 8px 24px ${WECHAT_GREEN}22`;
                    el.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.style.borderColor = 'var(--lobe-color-border-secondary, rgba(0,0,0,0.06))';
                    el.style.boxShadow = 'none';
                    el.style.transform = 'none';
                  }}
                >
                  {pendingChannel === 'wechat' ? (
                    <Spin
                      indicator={
                        <LoadingOutlined spin style={{ color: WECHAT_GREEN, fontSize: 36 }} />
                      }
                    />
                  ) : (
                    <WechatFilled style={{ color: WECHAT_GREEN, fontSize: 48 }} />
                  )}
                  <div style={{ fontSize: 15, fontWeight: 600 }}>微信支付</div>
                  <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
                    WeChat Pay
                  </div>
                </div>
              </Flexbox>
            </>
          ) : (
            <>
              {payModal?.qrCode ? (
                <Flexbox align="center" gap={10}>
                  {payModal.channel === 'wechat' ? (
                    <WechatFilled style={{ color: WECHAT_GREEN, fontSize: 28 }} />
                  ) : (
                    <AlipayCircleFilled style={{ color: ALIPAY_BLUE, fontSize: 28 }} />
                  )}
                  <QRCode
                    color={payModal.channel === 'wechat' ? WECHAT_GREEN : ALIPAY_BLUE}
                    errorLevel="M"
                    size={200}
                    value={payModal.qrCode}
                  />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {payModal.channel === 'wechat' ? '请使用微信扫码' : '请使用支付宝扫码'}
                  </div>
                </Flexbox>
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
              <div style={{ fontSize: 12, opacity: 0.7, textAlign: 'center' }}>
                订单号：{payModal?.outTradeNo}
                <br />
                状态：{orderStatus?.status || 'pending'}
              </div>
            </>
          )}
        </Flexbox>
      </Modal>
    </Flexbox>
  );
};

export default PlansPage;
