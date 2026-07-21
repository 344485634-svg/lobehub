import { and, count, desc, eq, ilike, or } from 'drizzle-orm';

import type { LobeChatDatabase } from '@/core/db/client';

import type { NewSubscriptionPlan, SubscriptionPlanItem } from '../schemas/subscriptionPlan';
import { subscriptionPlans } from '../schemas/subscriptionPlan';

export class PlanModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  // ===== User-level methods (placeholder for future user-facing queries) =====

  async findAll(opts?: { activeOnly?: boolean }): Promise<SubscriptionPlanItem[]> {
    const conditions = opts?.activeOnly ? eq(subscriptionPlans.active, true) : undefined;

    return this.db.query.subscriptionPlans.findMany({
      orderBy: [subscriptionPlans.sortOrder, subscriptionPlans.createdAt],
      where: conditions,
    });
  }

  async findById(id: string): Promise<SubscriptionPlanItem | undefined> {
    return this.db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, id),
    });
  }

  // ===== Admin-level static methods =====

  static async adminList(
    db: LobeChatDatabase,
    opts: {
      activeOnly?: boolean;
      page?: number;
      pageSize?: number;
      search?: string;
    },
  ): Promise<{ plans: SubscriptionPlanItem[]; total: number }> {
    const { page = 1, pageSize = 20, activeOnly, search } = opts;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (activeOnly) conditions.push(eq(subscriptionPlans.active, true));
    if (search) {
      conditions.push(
        or(
          ilike(subscriptionPlans.name, `%${search}%`),
          ilike(subscriptionPlans.displayName, `%${search}%`),
          ilike(subscriptionPlans.description, `%${search}%`),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [plans, [{ value: total }]] = await Promise.all([
      db.query.subscriptionPlans.findMany({
        limit: pageSize,
        offset,
        orderBy: [subscriptionPlans.sortOrder, desc(subscriptionPlans.createdAt)],
        where,
      }),
      db.select({ value: count() }).from(subscriptionPlans).where(where),
    ]);

    return { plans, total: Number(total) };
  }

  static async adminCreate(
    db: LobeChatDatabase,
    data: NewSubscriptionPlan,
  ): Promise<SubscriptionPlanItem> {
    const [plan] = await db.insert(subscriptionPlans).values(data).returning();
    return plan;
  }

  static async adminUpdate(
    db: LobeChatDatabase,
    id: string,
    value: Partial<
      Pick<
        SubscriptionPlanItem,
        | 'active'
        | 'billingCycle'
        | 'description'
        | 'displayName'
        | 'features'
        | 'name'
        | 'price'
        | 'quotas'
        | 'sortOrder'
      >
    >,
  ): Promise<SubscriptionPlanItem> {
    const [updated] = await db
      .update(subscriptionPlans)
      .set({ ...value, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, id))
      .returning();

    if (!updated) throw new Error(`Plan ${id} not found`);
    return updated;
  }

  static async adminDelete(db: LobeChatDatabase, id: string): Promise<void> {
    // Note: ON DELETE RESTRICT on user_subscriptions will prevent deletion if plan is in use
    await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id));
  }
}
