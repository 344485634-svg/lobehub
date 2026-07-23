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
        | 'allowedModels'
        | 'badge'
        | 'benefits'
        | 'billingCycle'
        | 'credits'
        | 'description'
        | 'displayName'
        | 'features'
        | 'highlight'
        | 'monthlyOriginalPrice'
        | 'monthlyPrice'
        | 'name'
        | 'price'
        | 'quotas'
        | 'sortOrder'
        | 'yearlyOriginalPrice'
        | 'yearlyPrice'
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

  /**
   * After a provider re-fetch, drop allowedModels entries for that provider
   * whose modelId is no longer present in the new catalog.
   * Pass empty validModelIds to remove all models of this provider from every plan.
   */
  static async pruneAllowedModelsForProvider(
    db: LobeChatDatabase,
    providerId: string,
    validModelIds: string[],
  ): Promise<{ plansUpdated: number; removed: number }> {
    const valid = new Set(validModelIds);
    const plans = await db.query.subscriptionPlans.findMany();
    let plansUpdated = 0;
    let removed = 0;

    for (const plan of plans) {
      const list =
        (plan.allowedModels as Array<{
          displayName?: string;
          modelId: string;
          providerId: string;
        }> | null) || [];
      if (!Array.isArray(list) || list.length === 0) continue;

      const next = list.filter((m) => {
        if (m.providerId !== providerId) return true;
        const keep = valid.has(m.modelId);
        if (!keep) removed += 1;
        return keep;
      });

      if (next.length !== list.length) {
        await db
          .update(subscriptionPlans)
          .set({ allowedModels: next, updatedAt: new Date() })
          .where(eq(subscriptionPlans.id, plan.id));
        plansUpdated += 1;
      }
    }

    return { plansUpdated, removed };
  }
}
