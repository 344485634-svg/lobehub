import type { LobeChatDatabase } from '@/database/type';

/**
 * Request-time model access check for the closed product.
 *
 * Rules (2026-10 按量付费优先):
 * - Admin: always allowed.
 * - 订阅是「额外权限」而非使用门槛:
 *   - 专属套餐模型(出现在某套餐 allowedModels 白名单中)必须订阅对应套餐才可调用;
 *   - 通配套餐(白名单为空)与订阅白名单外不收窄模型范围。
 * - 配价模型按余额门槛放行:总余额(套餐额度+赠送+充值)>0 即可调用,消费按量扣减
 *   (与 deductCredits 的扣费口径一致);余额不足提示充值。
 *
 * Returns null when access is granted, or an error message string when denied.
 */
export async function checkModelAccess(
  db: LobeChatDatabase,
  userId: string,
  providerId: string,
  modelId: string,
): Promise<string | null> {
  const { eq } = await import('drizzle-orm');
  const { users } = await import('@/database/schemas');

  // Admins bypass all checks
  const [userRow] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (userRow?.role === 'admin') return null;

  const { SubscriptionModel } = await import('@/database/models/subscription');
  const { PlanModel } = await import('@/database/models/plan');

  const sub = await new SubscriptionModel(db, userId).getCurrentSubscription();
  const allPlans = await new PlanModel(db, userId).findAll({ activeOnly: true });

  // 模型是否为「套餐专属」(出现于任一活跃套餐的 allowedModels 白名单)
  const isPlanGated = allPlans.some((plan) => {
    const list =
      (plan.allowedModels as Array<{ modelId: string; providerId: string }> | null) || [];
    return list.some((m) => m.providerId === providerId && m.modelId === modelId);
  });

  if (sub) {
    // 订阅用户:专属模型必须在所订阅套餐的白名单内
    const plan = await new PlanModel(db, userId).findById(sub.planId);
    const list =
      (plan?.allowedModels as Array<{ modelId: string; providerId: string }> | null) || [];

    if (list.length > 0 && isPlanGated) {
      const allowed = list.some(
        (m) => m.providerId === providerId && m.modelId === modelId,
      );
      if (!allowed) {
        return '当前套餐不包含此模型，请前往「设置 → 订阅套餐」升级或联系管理员。';
      }
    }
    // 通配套餐(白名单为空)或非专属模型:不收窄范围,继续走余额门槛
  } else if (isPlanGated) {
    // 无订阅 + 套餐专属模型:订阅解锁,余额不替代权限
    return '此模型为套餐专属，订阅对应套餐后可用（「设置 → 订阅套餐」）。';
  }

  // ---- 余额门槛:配价模型余额>0 即放行 ----
  const { AiModelModel } = await import('@/database/models/aiModel');
  let paid = false;
  try {
    const { eq: eq2 } = await import('drizzle-orm');
    const { users: usersTable } = await import('@/database/schemas');
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq2(usersTable.role, 'admin'))
      .limit(5);

    const ownerIds = [userId, ...admins.map((a) => a.id)];
    for (const ownerId of ownerIds) {
      const m = await new AiModelModel(db, ownerId).findByIdAndProvider(modelId, providerId);
      if (m) {
        const p = (m.pricing as any) || {};
        paid =
          Number(p.creditsPerRequest ?? 0) > 0 ||
          Number(p.creditsPerMillionInputTokens ?? 0) > 0 ||
          Number(p.creditsPerMillionOutputTokens ?? 0) > 0 ||
          Number(p.videoCreditsPerSecond ?? 0) > 0 ||
          Object.values(p.videoCreditsPerSecondByResolution || {}).some(
            (v) => Number(v) > 0,
          );
        break;
      }
    }
  } catch {
    paid = false;
  }

  // 免费模型:直接放行
  if (!paid) return null;

  // 动态 import 避免与 business-server 的循环依赖
  const { getCreditBalance } = await import('@/business/server/credits/deductCredits');
  const bal = await getCreditBalance(db, userId);
  if (bal.remaining > 0) return null;

  return '积分不足，请前往「设置 → 积分」充值后使用。';
}
