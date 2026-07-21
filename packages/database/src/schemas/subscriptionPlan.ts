import { boolean, decimal, integer, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps } from './_helpers';

export const subscriptionPlans = pgTable('subscription_plans', {
  id: varchar('id', { length: 255 })
    .$defaultFn(() => idGenerator('subscriptionPlans'))
    .primaryKey(),

  name: varchar('name', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  description: varchar('description', { length: 1000 }),

  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  billingCycle: varchar('billing_cycle', { length: 20, enum: ['monthly', 'yearly', 'lifetime'] })
    .notNull()
    .default('monthly'),

  // Quota configuration stored as JSON
  // Example: { "chatMessages": 1000, "imageGenerations": 50, "fileStorage": 5368709120 }
  quotas: jsonb('quotas').notNull().default('{}'),

  // Feature flags for UI display
  // Example: [{ "key": "priority_support", "enabled": true }]
  features: jsonb('features').default('[]'),

  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),

  ...timestamps,
});

export type SubscriptionPlanItem = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
