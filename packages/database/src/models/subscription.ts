import { and, count, desc, eq, sql } from 'drizzle-orm';

import type { LobeChatDatabase } from '@/core/db/client';
import type { SubscriptionPlanItem } from '@/schemas/subscriptionPlan';
import { subscriptionPlans } from '@/schemas/subscriptionPlan';
import { users } from '@/schemas/user';
import type { UserSubscriptionItem } from '@/schemas/userSubscription';
import { userSubscriptions } from '@/schemas/userSubscription';

export interface SubscriptionWithDetails extends UserSubscriptionItem {
  plan: SubscriptionPlanItem;
  user: {
    email: string | null;
    id: string;
    username: string | null;
  };
}

export class SubscriptionModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  // ===== User-level methods =====

  async getCurrentSubscription(): Promise<UserSubscriptionItem | undefined> {
    return this.db.query.userSubscriptions.findFirst({
      orderBy: desc(userSubscriptions.createdAt),
      where: and(eq(userSubscriptions.userId, this.userId), eq(userSubscriptions.status, 'active')),
    });
  }

  async getHistory(): Promise<UserSubscriptionItem[]> {
    return this.db.query.userSubscriptions.findMany({
      orderBy: desc(userSubscriptions.createdAt),
      where: eq(userSubscriptions.userId, this.userId),
    });
  }

  // ===== Admin-level static methods =====

  static async adminList(
    db: LobeChatDatabase,
    opts: {
      page?: number;
      pageSize?: number;
      planId?: string;
      status?: 'active' | 'cancelled' | 'expired' | 'trial';
      userId?: string;
    },
  ): Promise<{ subscriptions: SubscriptionWithDetails[]; total: number }> {
    const { page = 1, pageSize = 20, userId, planId, status } = opts;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (userId) conditions.push(eq(userSubscriptions.userId, userId));
    if (planId) conditions.push(eq(userSubscriptions.planId, planId));
    if (status) conditions.push(eq(userSubscriptions.status, status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [subscriptions, [{ value: total }]] = await Promise.all([
      db
        .select({
          // Subscription fields
          cancelledAt: userSubscriptions.cancelledAt,
          createdAt: userSubscriptions.createdAt,
          currentPeriodEnd: userSubscriptions.currentPeriodEnd,
          currentPeriodStart: userSubscriptions.currentPeriodStart,
          expiresAt: userSubscriptions.expiresAt,
          externalSubscriptionId: userSubscriptions.externalSubscriptionId,
          id: userSubscriptions.id,
          notes: userSubscriptions.notes,
          paymentMethod: userSubscriptions.paymentMethod,
          planId: userSubscriptions.planId,
          quotaUsage: userSubscriptions.quotaUsage,
          startedAt: userSubscriptions.startedAt,
          status: userSubscriptions.status,
          updatedAt: userSubscriptions.updatedAt,
          userId: userSubscriptions.userId,
          assignedBy: userSubscriptions.assignedBy,
          accessedAt: userSubscriptions.accessedAt,
          // Plan fields
          plan: {
            active: subscriptionPlans.active,
            billingCycle: subscriptionPlans.billingCycle,
            createdAt: subscriptionPlans.createdAt,
            description: subscriptionPlans.description,
            displayName: subscriptionPlans.displayName,
            features: subscriptionPlans.features,
            id: subscriptionPlans.id,
            name: subscriptionPlans.name,
            price: subscriptionPlans.price,
            quotas: subscriptionPlans.quotas,
            sortOrder: subscriptionPlans.sortOrder,
            updatedAt: subscriptionPlans.updatedAt,
            accessedAt: subscriptionPlans.accessedAt,
          },
          // User fields
          user: {
            email: users.email,
            id: users.id,
            username: users.username,
          },
        })
        .from(userSubscriptions)
        .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
        .innerJoin(users, eq(userSubscriptions.userId, users.id))
        .where(where)
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(userSubscriptions).where(where),
    ]);

    return { subscriptions, total: Number(total) };
  }

  static async adminAssign(
    db: LobeChatDatabase,
    data: {
      assignedBy: string;
      expiresAt?: Date | null;
      notes?: string;
      planId: string;
      startedAt?: Date;
      userId: string;
    },
  ): Promise<UserSubscriptionItem> {
    const startedAt = data.startedAt || new Date();
    const expiresAt = data.expiresAt;

    // Calculate current period based on plan's billing cycle
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, data.planId),
    });

    if (!plan) throw new Error(`Plan ${data.planId} not found`);

    const currentPeriodStart = startedAt;
    let currentPeriodEnd: Date | undefined;

    if (plan.billingCycle === 'monthly') {
      currentPeriodEnd = new Date(startedAt);
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    } else if (plan.billingCycle === 'yearly') {
      currentPeriodEnd = new Date(startedAt);
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    }
    // lifetime: currentPeriodEnd remains undefined

    // Cancel any existing active subscriptions for this user
    await db
      .update(userSubscriptions)
      .set({
        cancelledAt: new Date(),
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(eq(userSubscriptions.userId, data.userId), eq(userSubscriptions.status, 'active')),
      );

    const [subscription] = await db
      .insert(userSubscriptions)
      .values({
        assignedBy: data.assignedBy,
        currentPeriodEnd,
        currentPeriodStart,
        expiresAt,
        notes: data.notes,
        planId: data.planId,
        quotaUsage: sql`'{}'::jsonb`,
        startedAt,
        status: 'active',
        userId: data.userId,
      })
      .returning();

    return subscription;
  }

  static async adminCancel(db: LobeChatDatabase, id: string): Promise<void> {
    await db
      .update(userSubscriptions)
      .set({
        cancelledAt: new Date(),
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.id, id));
  }

  static async adminRenew(db: LobeChatDatabase, id: string, expiresAt: Date): Promise<void> {
    await db
      .update(userSubscriptions)
      .set({
        expiresAt,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.id, id));
  }

  static async adminUpdate(
    db: LobeChatDatabase,
    id: string,
    value: Partial<Pick<UserSubscriptionItem, 'notes' | 'status'>>,
  ): Promise<void> {
    await db
      .update(userSubscriptions)
      .set({ ...value, updatedAt: new Date() })
      .where(eq(userSubscriptions.id, id));
  }

  // ===== Quota management (for future extension) =====

  async checkQuota(quotaKey: string, amount: number): Promise<boolean> {
    const subscription = await this.getCurrentSubscription();
    if (!subscription) return false;

    const plan = await this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, subscription.planId),
    });

    if (!plan) return false;

    const quotas = plan.quotas as Record<string, number>;
    const usage = (subscription.quotaUsage as Record<string, number>) || {};

    const limit = quotas[quotaKey];
    if (limit === undefined) return true; // No limit defined

    const current = usage[quotaKey] || 0;
    return current + amount <= limit;
  }

  async consumeQuota(quotaKey: string, amount: number): Promise<void> {
    const subscription = await this.getCurrentSubscription();
    if (!subscription) throw new Error('No active subscription');

    const usage = (subscription.quotaUsage as Record<string, number>) || {};
    usage[quotaKey] = (usage[quotaKey] || 0) + amount;

    await this.db
      .update(userSubscriptions)
      .set({
        quotaUsage: sql`${JSON.stringify(usage)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.id, subscription.id));
  }

  async resetQuota(): Promise<void> {
    const subscription = await this.getCurrentSubscription();
    if (!subscription) return;

    await this.db
      .update(userSubscriptions)
      .set({
        quotaUsage: sql`'{}'::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.id, subscription.id));
  }
}
