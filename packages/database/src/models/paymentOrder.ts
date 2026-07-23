import { and, desc, eq } from 'drizzle-orm';

import {
  type NewPaymentOrder,
  type PaymentOrderItem,
  paymentOrders,
} from '../schemas/paymentOrder';
import type { LobeChatDatabase } from '../type';

export class PaymentOrderModel {
  constructor(
    private db: LobeChatDatabase,
    private userId?: string,
  ) {}

  async create(data: Omit<NewPaymentOrder, 'id' | 'userId'> & { userId?: string }) {
    const userId = data.userId || this.userId;
    if (!userId) throw new Error('userId required');
    const [row] = await this.db
      .insert(paymentOrders)
      .values({ ...data, userId })
      .returning();
    return row;
  }

  async findByOutTradeNo(outTradeNo: string): Promise<PaymentOrderItem | undefined> {
    return this.db.query.paymentOrders.findFirst({
      where: eq(paymentOrders.outTradeNo, outTradeNo),
    });
  }

  async findById(id: string): Promise<PaymentOrderItem | undefined> {
    return this.db.query.paymentOrders.findFirst({
      where: eq(paymentOrders.id, id),
    });
  }

  async listMine(limit = 20) {
    if (!this.userId) throw new Error('userId required');
    return this.db.query.paymentOrders.findMany({
      limit,
      orderBy: [desc(paymentOrders.createdAt)],
      where: eq(paymentOrders.userId, this.userId),
    });
  }

  async markPaid(id: string, opts: { notifyRaw?: Record<string, unknown>; tradeNo?: string }) {
    const [row] = await this.db
      .update(paymentOrders)
      .set({
        notifyRaw: opts.notifyRaw,
        paidAt: new Date(),
        status: 'paid',
        tradeNo: opts.tradeNo,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentOrders.id, id), eq(paymentOrders.status, 'pending')))
      .returning();
    return row;
  }

  async markFailed(id: string, errorMessage: string) {
    const [row] = await this.db
      .update(paymentOrders)
      .set({ errorMessage, status: 'failed', updatedAt: new Date() })
      .where(eq(paymentOrders.id, id))
      .returning();
    return row;
  }

  async updatePayPayload(id: string, payPayload: Record<string, unknown>, tradeNo?: string) {
    const [row] = await this.db
      .update(paymentOrders)
      .set({
        payPayload,
        tradeNo,
        updatedAt: new Date(),
      })
      .where(eq(paymentOrders.id, id))
      .returning();
    return row;
  }
}
