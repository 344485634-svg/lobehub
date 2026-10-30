import {
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
 * Append-only credit ledger for closed-product billing.
 * Positive amount = grant / top-up / refund / referral reward
 * Negative amount = consumption
 */
export const creditLedgers = pgTable(
  'credit_ledgers',
  {
    id: varchar('id', { length: 255 })
      .$defaultFn(() => idGenerator('creditLedgers'))
      .primaryKey(),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    /** Signed delta in product credits (supports up to 2 decimal places) */
    amount: decimal('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),

    /**
     * grant | plan_grant | topup | chat | image | video | refund | referral | adjust
     */
    reason: varchar('reason', { length: 32 }).notNull(),

    provider: varchar('provider', { length: 64 }),
    model: varchar('model', { length: 128 }),
    /** Optional free-form detail (tokens, duration, resolution, order id, etc.) */
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),

    /** Balance after this entry (plan remaining + topup remaining) */
    balanceAfter: decimal('balance_after', { precision: 12, scale: 2, mode: 'number' }),

    ...timestamps,
  },
  (t) => ({
    userCreatedIdx: index('credit_ledgers_user_created_idx').on(t.userId, t.createdAt),
    reasonIdx: index('credit_ledgers_reason_idx').on(t.reason),
  }),
);

export type CreditLedgerItem = typeof creditLedgers.$inferSelect;
export type NewCreditLedger = typeof creditLedgers.$inferInsert;

/** One invite code per user (level-1 referral) */
export const userInviteCodes = pgTable(
  'user_invite_codes',
  {
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .primaryKey(),
    code: varchar('code', { length: 16 }).notNull(),
    ...timestamps,
  },
  (t) => ({
    codeUq: uniqueIndex('user_invite_codes_code_uq').on(t.code),
  }),
);

export type UserInviteCodeItem = typeof userInviteCodes.$inferSelect;

/** Invitee bound to inviter (one inviter only, set once) */
export const userReferralBinds = pgTable(
  'user_referral_binds',
  {
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .primaryKey(),
    inviterId: text('inviter_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    inviteCode: varchar('invite_code', { length: 16 }).notNull(),
    boundAt: timestamp('bound_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => ({
    inviterIdx: index('user_referral_binds_inviter_idx').on(t.inviterId),
  }),
);

export type UserReferralBindItem = typeof userReferralBinds.$inferSelect;

/** Referral reward payouts */
export const referralRewards = pgTable(
  'referral_rewards',
  {
    id: varchar('id', { length: 255 })
      .$defaultFn(() => idGenerator('referralRewards'))
      .primaryKey(),
    inviterId: text('inviter_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    inviteeId: text('invitee_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    /** Source payment order id if any */
    orderId: varchar('order_id', { length: 255 }),
    /** Consumption amount in CNY that triggered reward */
    spendAmount: decimal('spend_amount', { precision: 10, scale: 2 }).notNull(),
    /** Applied rebate rate, e.g. 0.10 = 10% */
    rate: decimal('rate', { precision: 8, scale: 4 }).notNull(),
    /** Credits granted to inviter */
    credits: integer('credits').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('granted'),
    ...timestamps,
  },
  (t) => ({
    inviterIdx: index('referral_rewards_inviter_idx').on(t.inviterId),
    inviteeIdx: index('referral_rewards_invitee_idx').on(t.inviteeId),
  }),
);

export type ReferralRewardItem = typeof referralRewards.$inferSelect;
