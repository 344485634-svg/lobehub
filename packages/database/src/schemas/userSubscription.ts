import { index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps } from './_helpers';
import { subscriptionPlans } from './subscriptionPlan';
import { users } from './user';

export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    id: varchar('id', { length: 255 })
      .$defaultFn(() => idGenerator('subs'))
      .primaryKey(),

    userId: varchar('user_id', { length: 255 })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    planId: varchar('plan_id', { length: 255 })
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' })
      .notNull(),

    status: varchar('status', {
      enum: ['active', 'cancelled', 'expired', 'trial'],
      length: 20,
    })
      .notNull()
      .default('active'),

    // Billing cycle dates
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { mode: 'date', withTimezone: true }),

    // Current period for quota tracking
    currentPeriodStart: timestamp('current_period_start', { mode: 'date', withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { mode: 'date', withTimezone: true }),

    // Quota usage in current period
    // Example: { "chatMessages": 234, "imageGenerations": 12 }
    quotaUsage: jsonb('quota_usage').default('{}'),

    // Payment tracking (optional, for future integration)
    paymentMethod: varchar('payment_method', { length: 50 }),
    externalSubscriptionId: varchar('external_subscription_id', { length: 255 }),

    // Admin management
    notes: text('notes'),
    assignedBy: varchar('assigned_by', { length: 255 }).references(() => users.id),

    ...timestamps,
  },
  (table) => ({
    userIdStatusIdx: index('user_subscriptions_user_id_status_idx').on(table.userId, table.status),
    planIdIdx: index('user_subscriptions_plan_id_idx').on(table.planId),
    expiresAtIdx: index('user_subscriptions_expires_at_idx').on(table.expiresAt),
    statusPeriodIdx: index('user_subscriptions_status_period_idx').on(
      table.status,
      table.currentPeriodEnd,
    ),
  }),
);

export type UserSubscriptionItem = typeof userSubscriptions.$inferSelect;
export type NewUserSubscription = typeof userSubscriptions.$inferInsert;
