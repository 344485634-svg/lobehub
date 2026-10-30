'use client';

import { AlipayCircleFilled, WechatFilled } from '@ant-design/icons';
import { Flexbox } from '@lobehub/ui';
import { Button, Modal } from '@lobehub/ui/base-ui';
import { App, Card, Input, InputNumber, QRCode, Spin, Tag } from 'antd';
import { type FC, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import useSWR from 'swr';

import { lambdaClient } from '@/libs/trpc/client';

const ALIPAY_BLUE = '#1677FF';
const WECHAT_GREEN = '#07C160';

const CreditsPage: FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: balance, mutate: mutateBalance } = useSWR('credit-balance', () =>
    lambdaClient.topUp.balance.query(),
  );
  const { data: pkgs } = useSWR('topup-packages', () => lambdaClient.topUp.listPackages.query());

  const [amountCny, setAmountCny] = useState<number>(10);
  const [channel, setChannel] = useState<'alipay' | 'wechat'>('alipay');
  const [couponCode, setCouponCode] = useState('');
  const [couponPreview, setCouponPreview] = useState<{
    discountAmount: number;
    finalAmount: number;
    name: string;
    originalAmount: number;
    ticket: string;
  } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payModal, setPayModal] = useState<{
    credits: number;
    outTradeNo: string;
    qrCode?: string | null;
  } | null>(null);

  const outTradeNoFromUrl = searchParams.get('outTradeNo');
  useEffect(() => {
    if (outTradeNoFromUrl) {
      setPayModal({ credits: 0, outTradeNo: outTradeNoFromUrl, qrCode: null });
    }
  }, [outTradeNoFromUrl]);

  const { data: orderStatus } = useSWR(
    payModal?.outTradeNo ? ['topup-order', payModal.outTradeNo] : null,
    () =>
      lambdaClient.subscription.getOrder.query({
        outTradeNo: payModal!.outTradeNo,
      }),
    { refreshInterval: payModal ? 2500 : 0 },
  );

  useEffect(() => {
    if (orderStatus?.status === 'paid') {
      message.success('充值成功，积分已到账');
      setPayModal(null);
      mutateBalance();
      if (searchParams.has('outTradeNo')) {
        searchParams.delete('outTradeNo');
        setSearchParams(searchParams, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderStatus?.status]);

  const creditsPreview = Math.floor((Number(amountCny) || 0) * (pkgs?.rate || 100));

  const handlePay = async () => {
    if (!amountCny || amountCny < 1) {
      message.warning('请输入至少 1 元');
      return;
    }
    const code = couponCode.trim();
    // 有优惠码时先校验，避免未点「使用」就下单导致未带码
    if (code && !couponPreview) {
      setCouponChecking(true);
      try {
        const preview = await lambdaClient.spend.previewCoupon.mutate({
          amountCny: Number(amountCny) || 0,
          code,
          scope: 'topup',
        });
        setCouponPreview({
          discountAmount: preview.discountAmount,
          finalAmount: preview.finalAmount,
          name: preview.name,
          originalAmount: preview.originalAmount,
          ticket: preview.ticket,
        });
      } catch (e: any) {
        message.error(e?.message || '优惠码无效，请先修正后再支付');
        setCouponChecking(false);
        return;
      } finally {
        setCouponChecking(false);
      }
    }
    setPaying(true);
    try {
      const payload: Record<string, unknown> = {
        amountCny: Number(amountCny),
        channel,
      };
      if (code) payload.couponCode = code;
      // Prefer signed ticket from preview — survives client/type stripping issues
      const ticket = couponPreview?.ticket;
      if (ticket) payload.couponTicket = ticket;

      const res = await (lambdaClient.topUp.createOrder as any).mutate(payload);

      if (code) {
        if (!res.couponCode) {
          message.error('优惠码未生效，请检查后重试');
          return;
        }
        const paid = res.amount || res.discountAmount != null
          ? `实付 ¥${Number(res.amount).toFixed(2)}（已优惠 ¥${Number(res.discountAmount || 0).toFixed(2)}）`
          : '';
        if (paid) message.success(paid);
      }

      setPayModal({
        credits: res.credits,
        outTradeNo: res.outTradeNo,
        qrCode: res.qrCode,
      });
    } catch (e: any) {
      message.error(e?.message || '创建充值订单失败');
    } finally {
      setPaying(false);
    }
  };

  return (
    <Flexbox gap={16} padding={24}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>积分</div>
        <div style={{ color: 'var(--lobe-color-text-secondary)', marginTop: 4 }}>
          查看余额并充值（{pkgs?.rateLabel || '¥1 = 100 积分'}）
        </div>
      </div>

      <Flexbox gap={12} horizontal style={{ flexWrap: 'wrap' }}>
        <Card size="small" style={{ minWidth: 180 }}>
          <div style={{ opacity: 0.65 }}>可用积分</div>
          <div style={{ color: 'var(--lobe-color-primary)', fontSize: 32, fontWeight: 800 }}>
            {balance?.remaining ?? '-'}
          </div>
        </Card>
        <Card size="small" style={{ minWidth: 140 }}>
          <div style={{ opacity: 0.65 }}>套餐积分剩余</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{balance?.planRemaining ?? 0}</div>
          <div style={{ fontSize: 12, opacity: 0.5 }}>
            额度 {balance?.planLimit ?? 0} · 已用 {balance?.planUsed ?? 0}
          </div>
        </Card>
        <Card size="small" style={{ minWidth: 140 }}>
          <div style={{ opacity: 0.65 }}>充值积分余额</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{balance?.topupBalance ?? 0}</div>
        </Card>
        <Card size="small" style={{ minWidth: 140 }}>
          <div style={{ opacity: 0.65 }}>推荐奖励积分余额</div>
          <div style={{ color: '#fa8c16', fontSize: 22, fontWeight: 600 }}>
            {balance?.rewardBalance ?? 0}
          </div>
        </Card>
      </Flexbox>

      <div style={{ color: 'var(--lobe-color-text-secondary)', fontSize: 12 }}>
        积分扣除顺序：先扣套餐内积分，再扣充值积分，最后扣推荐奖励积分。
      </div>

      <Card size="small" title="充值积分">
        <Flexbox gap={16}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>快捷套餐</div>
          <Flexbox gap={8} horizontal style={{ flexWrap: 'wrap' }}>
            {(pkgs?.packages || []).map((p) => (
              <Button
                key={p.amountCny}
                type={amountCny === p.amountCny ? 'primary' : 'default'}
                onClick={() => { setAmountCny(p.amountCny); setCouponPreview(null); }}
              >
                ¥{p.amountCny} / {p.label}
              </Button>
            ))}
          </Flexbox>

          <Flexbox gap={8} horizontal style={{ alignItems: 'center' }}>
            <span>自定义金额（元）</span>
            <InputNumber
              min={1}
              precision={2}
              style={{ width: 160 }}
              value={amountCny}
              onChange={(v) => { setAmountCny(Number(v) || 1); setCouponPreview(null); }}
            />
            <Tag color="gold">预计到账 {creditsPreview} 积分</Tag>
          </Flexbox>

          <Flexbox gap={8} style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>优惠码（可选）</div>
            <Flexbox gap={8} horizontal>
              <Input
                allowClear
                placeholder="输入优惠码"
                style={{ flex: 1, textTransform: 'uppercase' }}
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setCouponPreview(null);
                }}
              />
              <Button
                loading={couponChecking}
                onClick={async () => {
                  if (!couponCode.trim()) {
                    message.warning('请输入优惠码');
                    return;
                  }
                  setCouponChecking(true);
                  try {
                    const preview = await lambdaClient.spend.previewCoupon.mutate({
                      amountCny: Number(amountCny) || 0,
                      code: couponCode.trim(),
                      scope: 'topup',
                    });
                    setCouponPreview({
                      discountAmount: preview.discountAmount,
                      finalAmount: preview.finalAmount,
                      name: preview.name,
                      originalAmount: preview.originalAmount,
                      ticket: preview.ticket,
                    });
                    message.success(
                      `已应用「${preview.name}」，应付 ¥${preview.finalAmount.toFixed(2)}（仍到账 ${creditsPreview} 积分）`,
                    );
                  } catch (e: any) {
                    setCouponPreview(null);
                    message.error(e?.message || '优惠码无效');
                  } finally {
                    setCouponChecking(false);
                  }
                }}
              >
                使用
              </Button>
            </Flexbox>
            {couponPreview && (
              <div style={{ fontSize: 12 }}>
                原价 ¥{couponPreview.originalAmount.toFixed(2)} − 优惠 ¥
                {couponPreview.discountAmount.toFixed(2)} ={' '}
                <strong>应付 ¥{couponPreview.finalAmount.toFixed(2)}</strong>
                <span style={{ marginLeft: 8, opacity: 0.65 }}>积分仍按面额到账</span>
              </div>
            )}
          </Flexbox>

          <Flexbox gap={12} horizontal>
            <Button
              icon={<AlipayCircleFilled style={{ color: ALIPAY_BLUE }} />}
              type={channel === 'alipay' ? 'primary' : 'default'}
              onClick={() => setChannel('alipay')}
            >
              支付宝
            </Button>
            <Button
              icon={<WechatFilled style={{ color: WECHAT_GREEN }} />}
              type={channel === 'wechat' ? 'primary' : 'default'}
              onClick={() => setChannel('wechat')}
            >
              微信
            </Button>
          </Flexbox>

          <div>
            <Button loading={paying} size="large" type="primary" onClick={handlePay}>
              立即充值
            </Button>
          </div>
        </Flexbox>
      </Card>

      <Modal
        footer={null}
        open={!!payModal}
        title="扫码支付"
        onCancel={() => setPayModal(null)}
      >
        <Flexbox align="center" gap={12} style={{ padding: 12 }}>
          {payModal?.qrCode ? (
            <>
              {channel === 'wechat' ? (
                <WechatFilled style={{ color: WECHAT_GREEN, fontSize: 28 }} />
              ) : (
                <AlipayCircleFilled style={{ color: ALIPAY_BLUE, fontSize: 28 }} />
              )}
              <QRCode
                color={channel === 'wechat' ? WECHAT_GREEN : ALIPAY_BLUE}
                errorLevel="M"
                size={200}
                value={payModal.qrCode}
              />
              <div>
                充值 {payModal.credits || creditsPreview} 积分 · 状态{' '}
                {orderStatus?.status || 'pending'}
              </div>
            </>
          ) : (
            <Spin tip="等待支付信息…" />
          )}
          <div style={{ fontSize: 12, opacity: 0.6 }}>订单号：{payModal?.outTradeNo}</div>
        </Flexbox>
      </Modal>
    </Flexbox>
  );
};

export default CreditsPage;
