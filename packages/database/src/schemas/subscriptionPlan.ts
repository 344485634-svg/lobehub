import { boolean, decimal, integer, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps } from './_helpers';

/**
 * Subscription plan definition for closed-product billing.
 *
 * Pricing:
 * - monthlyPrice / yearlyPrice: 现价（折扣价）
 * - monthlyOriginalPrice / yearlyOriginalPrice: 原价（划线价）
 * - credits: 套餐包含积分点
 *
 * Access:
 * - benefits: 权益文案列表，如「Seedance 2.0 快速通道」
 * - allowedModels: 可用模型列表 [{ providerId, modelId, displayName? }]
 * - quotas.credits 与 credits 字段同步，兼容旧逻辑
 */
export const subscriptionPlans = pgTable('subscription_plans', {
  id: varchar('id', { length: 255 })
    .$defaultFn(() => idGenerator('subscriptionPlans'))
    .primaryKey(),

  name: varchar('name', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  description: varchar('description', { length: 1000 }),

  // legacy single price (kept for backward compat; prefer monthly/yearly)
  price: decimal('price', { precision: 10, scale: 2 }).notNull().default('0'),
  billingCycle: varchar('billing_cycle', { length: 20, enum: ['monthly', 'yearly', 'lifetime'] })
    .notNull()
    .default('monthly'),

  monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }).default('0'),
  monthlyOriginalPrice: decimal('monthly_original_price', { precision: 10, scale: 2 }),
  yearlyPrice: decimal('yearly_price', { precision: 10, scale: 2 }).default('0'),
  yearlyOriginalPrice: decimal('yearly_original_price', { precision: 10, scale: 2 }),

  /** Included credit points for this plan period */
  credits: integer('credits').notNull().default(0),

  // Quota configuration stored as JSON (legacy + credits mirror)
  quotas: jsonb('quotas').notNull().default('{}'),

  /**
   * Benefit lines for marketing UI.
   * Example: ["支持 Seedance 2.0 快速通道", "优先队列", "专属客服"]
   */
  benefits: jsonb('benefits').$type<string[]>().default([]),

  /**
   * Allowed models for this plan.
   * Example: [{ "providerId": "newapi", "modelId": "gpt-4o", "displayName": "GPT-4o" }]
   * Empty array = no model access; null/undefined treated as empty for closed product.
   */
  allowedModels: jsonb('allowed_models')
    .$type<Array<{ displayName?: string; modelId: string; providerId: string }>>()
    .default([]),

  // legacy features field
  features: jsonb('features').default('[]'),

  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  highlight: boolean('highlight').default(false),
  badge: varchar('badge', { length: 64 }),

  ...timestamps,
});

export type SubscriptionPlanItem = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

export type PlanAllowedModel = {
  displayName?: string;
  modelId: string;
  providerId: string;
};
