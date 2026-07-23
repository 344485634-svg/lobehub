import { NextResponse } from 'next/server';

import { fulfillPaidOrder } from '@/business/server/lambda-routers/subscription';
import { PaymentOrderModel } from '@/database/models/paymentOrder';
import { getServerDB } from '@/database/server';

/**
 * 收钱吧支付结果异步通知
 * 兼容 form / json body，成功时返回 "success"
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let payload: Record<string, any> = {};

    if (contentType.includes('application/json')) {
      payload = (await req.json()) as Record<string, any>;
    } else {
      const form = await req.formData();
      form.forEach((v, k) => {
        payload[k] = typeof v === 'string' ? v : String(v);
      });
    }

    // 兼容多种字段命名
    const outTradeNo =
      payload.client_sn ||
      payload.out_trade_no ||
      payload.outTradeNo ||
      payload?.biz_response?.client_sn ||
      payload?.data?.client_sn;

    const tradeNo =
      payload.sn ||
      payload.trade_no ||
      payload.tradeNo ||
      payload?.biz_response?.sn ||
      payload?.data?.sn;

    const status =
      payload.status ||
      payload.order_status ||
      payload?.biz_response?.order_status ||
      payload?.data?.order_status;

    if (!outTradeNo) {
      return new NextResponse('missing out_trade_no', { status: 400 });
    }

    const db = await getServerDB();
    const orderModel = new PaymentOrderModel(db);
    const order = await orderModel.findByOutTradeNo(String(outTradeNo));
    if (!order) {
      return new NextResponse('order not found', { status: 404 });
    }

    const paidLike =
      !status ||
      ['SUCCESS', 'PAID', 'paid', 'success', '2', 2].includes(status) ||
      String(status).toUpperCase() === 'SUCCESS';

    if (paidLike && order.status !== 'paid') {
      await fulfillPaidOrder(db, order.id, {
        notifyRaw: payload,
        tradeNo: tradeNo ? String(tradeNo) : undefined,
      });
    }

    // 收钱吧要求返回 success 字符串
    return new NextResponse('success', { status: 200 });
  } catch (error) {
    console.error('[shouqianba notify]', error);
    return new NextResponse('fail', { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'shouqianba-notify' });
}
