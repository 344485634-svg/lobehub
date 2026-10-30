import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps } from './_helpers';
import { users } from './user';

/**
 * Coupon definitions (admin-managed).
 *
 * type:
 * - percent: value is discount percent 1-100 (e.g. 20 = 8 折 / 20% off)
 * - fixed: value is fixed CNY off (e.g. 10 = 减 10 元)
 *
 * minAmount: optional minimum order amount (CNY) before coupon applies
 * scope: subscription | topup | all
 */
export const coupons = pgTable(
  'coupons',
  {
    id: varchar('id', { length: 255 })
      .$defaultFn(() => idGenerator('coupons'))
      .primaryKey(),

    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),

    type: varchar('type', { length: 16 }).notNull(), // percent | fixed
    /** percent: 1-100; fixed: CNY amount */
    value: decimal('value', { precision: 10, scale: 2 }).notNull(),

    minAmount: decimal('min_amount', { precision: 10, scale: 2 }),
    maxDiscount: decimal('max_discount', { precision: 10, scale: 2 }),

    /** subscription | topup | all */
    scope: varchar('scope', { length: 16 }).notNull().default('all'),

    totalLimit: integer('total_limit'),
    perUserLimit: integer('per_user_limit').default(1),
    usedCount: integer('used_count').notNull().default(0),

    startsAt: timestamp('starts_at', { mode: 'date', withTimezone: true }),
    endsAt: timestamp('ends_at', { mode: 'date', withTimezone: true }),

    active: boolean('active').notNull().default(true),
    createdBy: text('created_by'),

    ...timestamps,
  },
  (t) => ({
    codeUq: uniqueIndex('coupons_code_uq').on(t.code),
    activeIdx: index('coupons_active_idx').on(t.active),
  }),
);

export type CouponItem = typeof coupons.$inferSelect;
export type NewCoupon = typeof coupons.$inferInsert;

/** Redemption log when an order successfully applies a coupon */
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: varchar('id', { length: 255 })
      .$defaultFn(() => idGenerator('couponRedemptions'))
      .primaryKey(),
    couponId: varchar('coupon_id', { length: 255 })
      .references(() => coupons.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    orderId: varchar('order_id', { length: 255 }),
    discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).notNull(),
    originalAmount: decimal('original_amount', { precision: 10, scale: 2 }).notNull(),
    finalAmount: decimal('final_amount', { precision: 10, scale: 2 }).notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => ({
    couponIdx: index('coupon_redemptions_coupon_idx').on(t.couponId),
    userIdx: index('coupon_redemptions_user_idx').on(t.userId),
  }),
);

export type CouponRedemptionItem = typeof couponRedemptions.$inferSelect;
