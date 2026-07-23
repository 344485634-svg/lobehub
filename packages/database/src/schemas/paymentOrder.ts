import { decimal, index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps } from './_helpers';
import { subscriptionPlans } from './subscriptionPlan';
import { users } from './user';

export const paymentOrders = pgTable(
  'payment_orders',
  {
    id: varchar('id', { length: 255 })
      .$defaultFn(() => idGenerator('paymentOrders'))
      .primaryKey(),

    userId: varchar('user_id', { length: 255 })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    planId: varchar('plan_id', { length: 255 })
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' })
      .notNull(),

    /** Merchant order id sent to payment gateway */
    outTradeNo: varchar('out_trade_no', { length: 64 }).notNull().unique(),

    /** Gateway transaction/sn id */
    tradeNo: varchar('trade_no', { length: 128 }),

    provider: varchar('provider', { length: 32 }).notNull().default('shouqianba'),
    channel: varchar('channel', { length: 32 }), // alipay | wechat | unionpay

    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 8 }).notNull().default('CNY'),
    subject: varchar('subject', { length: 255 }).notNull(),

    status: varchar('status', {
      enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded'],
      length: 20,
    })
      .notNull()
      .default('pending'),

    /** QR code content / pay url returned by gateway */
    payPayload: jsonb('pay_payload').$type<Record<string, unknown>>().default({}),

    paidAt: timestamp('paid_at', { mode: 'date', withTimezone: true }),
    notifyRaw: jsonb('notify_raw').$type<Record<string, unknown>>(),
    errorMessage: text('error_message'),

    ...timestamps,
  },
  (t) => ({
    userIdIdx: index('payment_orders_user_id_idx').on(t.userId),
    statusIdx: index('payment_orders_status_idx').on(t.status),
    outTradeNoIdx: index('payment_orders_out_trade_no_idx').on(t.outTradeNo),
  }),
);

export type PaymentOrderItem = typeof paymentOrders.$inferSelect;
export type NewPaymentOrder = typeof paymentOrders.$inferInsert;
