import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { loadReferralPolicy } from '@/business/server/payment/fulfillPaidOrder';
import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AgentSkillModel } from '@/database/models/agentSkill';
import { AiModelModel } from '@/database/models/aiModel';
import { AiProviderModel } from '@/database/models/aiProvider';
import { ApiKeyModel } from '@/database/models/apiKey';
import { CouponModel } from '@/database/models/coupon';
import { PlanModel } from '@/database/models/plan';
import { SubscriptionModel } from '@/database/models/subscription';
import { SystemConfigModel } from '@/database/models/systemConfig';
import { UserModel } from '@/database/models/user';
import { AiInfraRepos } from '@/database/repositories/aiInfra';
import type {
  EmailSmtpConfig,
  ReferralPolicyConfig,
  ShouqianbaConfig,
  StorageImageHostConfig,
} from '@/database/schemas/systemConfig';
import { SYSTEM_CONFIG_KEYS } from '@/database/schemas/systemConfig';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { EmailService } from '@/server/services/email';
import { SkillImporter } from '@/server/services/skill';
import { uploadImageToImageHost } from '@/server/services/storage/imageHost';

import { ShouqianbaClient } from '../../services/payment/shouqianba';

const adminProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const currentUser = await UserModel.findById(ctx.serverDB, ctx.userId);
  if (!currentUser || currentUser.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return opts.next();
});

const assertNotSelf = (targetUserId: string, currentUserId: string) => {
  if (targetUserId === currentUserId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot act on your own account' });
  }
};

export const adminRouter = router({
  banUser: adminProcedure
    .input(z.object({ expiresAt: z.string().optional(), reason: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({
        banExpires: input.expiresAt ? new Date(input.expiresAt) : null,
        banReason: input.reason,
        banned: true,
      });
      return { success: true as const };
    }),

  deleteApiKey: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ApiKeyModel.adminDelete(ctx.serverDB, input.id);
      return { success: true as const };
    }),

  deleteSkill: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return AgentSkillModel.adminDelete(ctx.serverDB, input.id);
    }),

  getUserDetail: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const detail = await UserModel.getUserDetailById(ctx.serverDB, input.userId);
      if (!detail) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return detail;
    }),

  listUsers: adminProcedure
    .input(
      z.object({
        bannedOnly: z.boolean().optional(),
        email: z.string().optional(),
        hasSubscription: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        planId: z.string().optional(),
        registeredFrom: z.string().optional(),
        registeredTo: z.string().optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        and: dbAnd,
        count: dbCount,
        desc: dbDesc,
        eq: dbEq,
        gte,
        ilike: dbIlike,
        inArray: dbInArray,
        lte,
        or: dbOr,
        sql: dbSql,
      } = await import('drizzle-orm');
      const {
        users: usersT,
        userSubscriptions: userSubsT,
        subscriptionPlans: subPlansT,
        paymentOrders: payOrdersT,
        userReferralBinds: refBindsT,
        referralRewards: refRewardsT,
      } = await import('@/database/schemas');

      const db = ctx.serverDB;
      const {
        page,
        pageSize,
        search,
        bannedOnly,
        email,
        hasSubscription,
        planId,
        registeredFrom,
        registeredTo,
      } = input;

      const conditions: any[] = [];
      if (search) {
        conditions.push(
          dbOr(dbIlike(usersT.email, `%${search}%`), dbIlike(usersT.username, `%${search}%`)),
        );
      }
      if (email) {
        conditions.push(dbIlike(usersT.email, `%${email}%`));
      }
      if (bannedOnly) {
        conditions.push(dbEq(usersT.banned, true));
      }
      if (registeredFrom) {
        conditions.push(gte(usersT.createdAt, new Date(registeredFrom)));
      }
      if (registeredTo) {
        conditions.push(lte(usersT.createdAt, new Date(registeredTo)));
      }
      const where = conditions.length > 0 ? dbAnd(...conditions) : undefined;

      const [{ total }] = await db.select({ total: dbCount() }).from(usersT).where(where);

      const rows = await db
        .select({
          banReason: usersT.banReason,
          banned: usersT.banned,
          createdAt: usersT.createdAt,
          email: usersT.email,
          fullName: usersT.fullName,
          id: usersT.id,
          lastActiveAt: usersT.lastActiveAt,
          planCredits: subPlansT.credits,
          planDisplayName: subPlansT.displayName,
          planId: userSubsT.planId,
          quotaUsage: userSubsT.quotaUsage,
          role: usersT.role,
          subExpiresAt: userSubsT.expiresAt,
          subStartedAt: userSubsT.startedAt,
          subStatus: userSubsT.status,
          username: usersT.username,
        })
        .from(usersT)
        .leftJoin(
          userSubsT,
          dbAnd(dbEq(userSubsT.userId, usersT.id), dbEq(userSubsT.status, 'active')),
        )
        .leftJoin(subPlansT, dbEq(subPlansT.id, userSubsT.planId))
        .where(where)
        .orderBy(dbDesc(usersT.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const userIds = rows.map((r) => r.id).filter(Boolean);
      if (userIds.length === 0) return { total: Number(total), users: [] };

      // Batch: total paid spend
      const spendRows = await db
        .select({
          totalSpend: dbSql<string>`COALESCE(SUM(${payOrdersT.amount}), 0)::text`,
          userId: payOrdersT.userId,
        })
        .from(payOrdersT)
        .where(dbAnd(dbInArray(payOrdersT.userId, userIds), dbEq(payOrdersT.status, 'paid')))
        .groupBy(payOrdersT.userId);

      // Batch: invite count
      const inviteRows = await db
        .select({
          inviteCount: dbSql<number>`COUNT(*)::int`,
          inviterId: refBindsT.inviterId,
        })
        .from(refBindsT)
        .where(dbInArray(refBindsT.inviterId, userIds))
        .groupBy(refBindsT.inviterId);

      // Batch: total reward credits
      const rewardRows = await db
        .select({
          inviterId: refRewardsT.inviterId,
          totalCredits: dbSql<number>`COALESCE(SUM(${refRewardsT.credits}), 0)::int`,
        })
        .from(refRewardsT)
        .where(dbInArray(refRewardsT.inviterId, userIds))
        .groupBy(refRewardsT.inviterId);

      const spendMap: Record<string, string> = {};
      for (const r of spendRows) spendMap[r.userId] = r.totalSpend;
      const inviteMap: Record<string, number> = {};
      for (const r of inviteRows) inviteMap[r.inviterId] = r.inviteCount;
      const rewardMap: Record<string, number> = {};
      for (const r of rewardRows) rewardMap[r.inviterId] = r.totalCredits;

      const enriched = rows.map((row) => {
        const usage = (row.quotaUsage as any) || {};
        const usedCredits = Number(usage?.credits || 0);
        const planCredits = Number(row.planCredits || 0);
        const topupCredits = Math.max(0, Number(usage?.topupCredits || 0));
        const rewardCredits = Math.max(0, Number(usage?.rewardCredits || 0));
        const planRemaining = planCredits > 0 ? Math.max(0, planCredits - usedCredits) : 0;
        return {
          ...row,
          inviteCount: inviteMap[row.id] || 0,
          planRemaining,
          planUsed: usedCredits,
          remainingCredits: planRemaining + topupCredits + rewardCredits,
          rewardCredits: rewardMap[row.id] || 0,
          topupCredits,
          totalSpend: spendMap[row.id] || '0',
        };
      });

      // If planId filter requested, post-filter (simple approach for admin page)
      const filtered = planId
        ? enriched.filter((u) => u.planId === planId)
        : hasSubscription === true
          ? enriched.filter((u) => !!u.subStatus)
          : hasSubscription === false
            ? enriched.filter((u) => !u.subStatus)
            : enriched;

      return { total: Number(total), users: filtered };
    }),

  listAllApiKeys: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ApiKeyModel.adminListAll(ctx.serverDB, input);
    }),

  listAllSkills: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        source: z.enum(['builtin', 'market', 'user']).optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return AgentSkillModel.adminListAll(ctx.serverDB, input);
    }),

  unbanUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({ banExpires: null, banReason: null, banned: false });
      return { success: true as const };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ role: z.enum(['admin', 'user']), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertNotSelf(input.userId, ctx.userId);
      const target = new UserModel(ctx.serverDB, input.userId);
      await target.updateUser({ role: input.role });
      return { success: true as const };
    }),

  adjustUserCredits: adminProcedure
    .input(
      z.object({
        amount: z.number().int().min(-1_000_000).max(1_000_000),
        note: z.string().optional(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // amount > 0 增加积分；amount < 0 减少积分（按套餐→充值→奖励顺序扣）
      const { adjustCredits, getCreditBalance } =
        await import('@/business/server/credits/deductCredits');
      await adjustCredits(ctx.serverDB, input.userId, input.amount, {
        note: input.note,
        reason: 'adjust',
      });
      const bal = await getCreditBalance(ctx.serverDB, input.userId);
      return { success: true as const, ...bal };
    }),

  updateApiKey: adminProcedure
    .input(
      z.object({
        id: z.string(),
        value: z.object({
          enabled: z.boolean().optional(),
          expiresAt: z.date().nullish(),
          name: z.string().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ApiKeyModel.adminUpdate(ctx.serverDB, input.id, input.value);
      return { success: true as const };
    }),

  // ===== Subscription Plans Management =====
  listPlans: adminProcedure
    .input(
      z.object({
        activeOnly: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return PlanModel.adminList(ctx.serverDB, input);
    }),

  getPlan: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const model = new PlanModel(ctx.serverDB, ctx.userId);
    const plan = await model.findById(input.id);
    if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
    return plan;
  }),

  createPlan: adminProcedure
    .input(
      z.object({
        active: z.boolean().default(true),
        allowedModels: z
          .array(
            z.object({
              discountRate: z.number().min(0.01).max(1).optional(),
              displayName: z.string().optional(),
              modelId: z.string(),
              providerId: z.string(),
            }),
          )
          .default([]),
        badge: z.string().optional(),
        benefits: z.array(z.string()).default([]),
        billingCycle: z.enum(['monthly', 'yearly', 'lifetime']).default('monthly'),
        credits: z.number().int().min(0).default(0),
        description: z.string().optional(),
        displayName: z.string(),
        features: z
          .array(
            z.object({
              enabled: z.boolean(),
              key: z.string(),
            }),
          )
          .default([]),
        highlight: z.boolean().optional(),
        monthlyOriginalPrice: z.string().optional(),
        monthlyPrice: z.string().default('0'),
        name: z.string(),
        price: z.string().optional(), // legacy
        quotas: z.record(z.number()).default({}),
        sortOrder: z.number().default(0),
        yearlyOriginalPrice: z.string().optional(),
        yearlyPrice: z.string().default('0'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const monthlyPrice = input.monthlyPrice || input.price || '0';
      const quotas = {
        ...input.quotas,
        credits: input.credits,
      };
      return PlanModel.adminCreate(ctx.serverDB, {
        active: input.active,
        allowedModels: input.allowedModels,
        badge: input.badge,
        benefits: input.benefits,
        billingCycle: input.billingCycle,
        credits: input.credits,
        description: input.description,
        displayName: input.displayName,
        features: input.features,
        highlight: input.highlight ?? false,
        monthlyOriginalPrice: input.monthlyOriginalPrice,
        monthlyPrice,
        name: input.name,
        price: monthlyPrice,
        quotas,
        sortOrder: input.sortOrder,
        yearlyOriginalPrice: input.yearlyOriginalPrice,
        yearlyPrice: input.yearlyPrice,
      });
    }),

  updatePlan: adminProcedure
    .input(
      z.object({
        active: z.boolean().optional(),
        allowedModels: z
          .array(
            z.object({
              discountRate: z.number().min(0.01).max(1).optional(),
              displayName: z.string().optional(),
              modelId: z.string(),
              providerId: z.string(),
            }),
          )
          .optional(),
        badge: z.string().nullish(),
        benefits: z.array(z.string()).optional(),
        billingCycle: z.enum(['monthly', 'yearly', 'lifetime']).optional(),
        credits: z.number().int().min(0).optional(),
        description: z.string().optional(),
        displayName: z.string().optional(),
        features: z
          .array(
            z.object({
              enabled: z.boolean(),
              key: z.string(),
            }),
          )
          .optional(),
        highlight: z.boolean().optional(),
        id: z.string(),
        monthlyOriginalPrice: z.string().nullish(),
        monthlyPrice: z.string().optional(),
        name: z.string().optional(),
        price: z.string().optional(),
        quotas: z.record(z.number()).optional(),
        sortOrder: z.number().optional(),
        yearlyOriginalPrice: z.string().nullish(),
        yearlyPrice: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const value: Record<string, unknown> = { ...rest };
      if (rest.monthlyPrice !== undefined) value.price = rest.monthlyPrice;
      if (rest.credits !== undefined) {
        value.quotas = { ...rest.quotas, credits: rest.credits };
      }
      return PlanModel.adminUpdate(ctx.serverDB, id, value as any);
    }),

  deletePlan: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await PlanModel.adminDelete(ctx.serverDB, input.id);
      return { success: true as const };
    }),

  // ===== User Subscriptions Management =====
  listSubscriptions: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        planId: z.string().optional(),
        status: z.enum(['active', 'cancelled', 'expired', 'trial']).optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return SubscriptionModel.adminList(ctx.serverDB, input);
    }),

  assignSubscription: adminProcedure
    .input(
      z.object({
        expiresAt: z.string().nullish(), // ISO date string, null = lifetime
        notes: z.string().optional(),
        planId: z.string(),
        startedAt: z.string().optional(), // ISO date string
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return SubscriptionModel.adminAssign(ctx.serverDB, {
        assignedBy: ctx.userId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        notes: input.notes,
        planId: input.planId,
        startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
        userId: input.userId,
      });
    }),

  cancelSubscription: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await SubscriptionModel.adminCancel(ctx.serverDB, input.id);
      return { success: true as const };
    }),

  renewSubscription: adminProcedure
    .input(
      z.object({
        expiresAt: z.string(), // ISO date string
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await SubscriptionModel.adminRenew(ctx.serverDB, input.id, new Date(input.expiresAt));
      return { success: true as const };
    }),

  // ===== Platform Model Providers (admin-managed keys for closed product) =====
  listProviders: adminProcedure.query(async ({ ctx }) => {
    const model = new AiProviderModel(ctx.serverDB, ctx.userId);
    const list = await model.getAiProviderList();
    // Ensure newapi exists for closed product
    if (!list.some((p) => p.id === 'newapi')) {
      await model.create({
        id: 'newapi',
        name: 'LIUMA 官方 API',
        source: 'builtin',
      });
      return model.getAiProviderList();
    }
    return list;
  }),

  getProvider: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const model = new AiProviderModel(ctx.serverDB, ctx.userId);
    const detail = await model.getAiProviderById(input.id, KeyVaultsGateKeeper.getUserKeyVaults);
    if (!detail) throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' });
    // Mask API key for UI display
    const keyVaults = { ...detail.keyVaults } as Record<string, any>;
    if (typeof keyVaults.apiKey === 'string' && keyVaults.apiKey.length > 8) {
      keyVaults.apiKeyMasked = keyVaults.apiKey.slice(0, 4) + '••••' + keyVaults.apiKey.slice(-4);
      keyVaults.hasApiKey = true;
      delete keyVaults.apiKey;
    } else {
      keyVaults.hasApiKey = Boolean(keyVaults.apiKey);
      delete keyVaults.apiKey;
    }
    return { ...detail, keyVaults };
  }),

  updateProviderConfig: adminProcedure
    .input(
      z.object({
        enabled: z.boolean().optional(),
        id: z.string(),
        keyVaults: z
          .object({
            apiKey: z.string().optional(),
            baseURL: z.string().optional(),
          })
          .optional(),
        name: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = new AiProviderModel(ctx.serverDB, ctx.userId);
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();

      if (input.name !== undefined || input.enabled !== undefined) {
        await model.update(input.id, {
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
        });
      }

      if (input.keyVaults) {
        // Skip empty apiKey so we don't wipe existing secret when user only changes baseURL
        const keyVaults: Record<string, string> = {};
        if (input.keyVaults.baseURL !== undefined) keyVaults.baseURL = input.keyVaults.baseURL;
        if (input.keyVaults.apiKey) keyVaults.apiKey = input.keyVaults.apiKey;

        if (Object.keys(keyVaults).length > 0) {
          await model.updateConfig(
            input.id,
            { keyVaults },
            (s) => gateKeeper.encrypt(s),
            KeyVaultsGateKeeper.getUserKeyVaults,
          );
        }
      }

      if (input.enabled !== undefined) {
        await model.toggleProviderEnabled(input.id, input.enabled);
      }

      // 更换 baseURL / API Key 后清掉旧 remote 模型与套餐引用，需重新拉取
      if (input.keyVaults && (input.keyVaults.apiKey || input.keyVaults.baseURL)) {
        const aiModelModel = new AiModelModel(ctx.serverDB, ctx.userId);
        await aiModelModel.clearRemoteModels(input.id);
        await PlanModel.pruneAllowedModelsForProvider(ctx.serverDB, input.id, []);
      }

      return { success: true as const };
    }),

  toggleProviderEnabled: adminProcedure
    .input(z.object({ enabled: z.boolean(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const model = new AiProviderModel(ctx.serverDB, ctx.userId);
      await model.toggleProviderEnabled(input.id, input.enabled);
      return { success: true as const };
    }),

  // ===== Platform Models (fetch from upstream + enable/disable) =====
  listProviderModels: adminProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { getServerGlobalConfig } = await import('@/server/globalConfig');
      const { aiProvider } = await getServerGlobalConfig();
      const repo = new AiInfraRepos(ctx.serverDB, ctx.userId, aiProvider as any);
      return repo.getAiProviderModelList(input.providerId);
    }),

  fetchProviderModels: adminProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const runtime = await initModelRuntimeFromDB(ctx.serverDB, ctx.userId, input.providerId);
      const remoteList = (await runtime.models()) || [];

      const aiModelModel = new AiModelModel(ctx.serverDB, ctx.userId);

      // 换上游/密钥后重新拉取：先清空该服务商已有 remote 模型，避免旧厂商模型残留
      await aiModelModel.clearRemoteModels(input.providerId);

      const models = remoteList.map((model: any) => {
        const result: any = {
          ...model,
          // 新拉取的模型默认关闭，由管理员手动开启
          enabled: model.enabled ?? false,
          source: 'remote',
        };

        const hasAnyAbility =
          model.files ||
          model.functionCall ||
          model.imageOutput ||
          model.reasoning ||
          model.search ||
          model.video ||
          model.vision;

        if (hasAnyAbility) {
          result.abilities = {
            files: model.files,
            functionCall: model.functionCall,
            imageOutput: model.imageOutput,
            reasoning: model.reasoning,
            search: model.search,
            video: model.video,
            vision: model.vision,
          };
        }

        if (model.type) result.type = model.type;
        return result;
      });

      await aiModelModel.batchUpdateAiModels(input.providerId, models);

      // 同步清理所有套餐里已失效的可用模型（上一家厂商残留）
      const validIds = models.map((m: any) => m.id).filter(Boolean);
      const prune = await PlanModel.pruneAllowedModelsForProvider(
        ctx.serverDB,
        input.providerId,
        validIds,
      );

      return {
        count: models.length,
        models: await aiModelModel.getModelListByProviderId(input.providerId),
        prunedPlanModels: prune.removed,
        prunedPlans: prune.plansUpdated,
      };
    }),

  prunePlanModelsForProvider: adminProcedure
    .input(
      z.object({
        providerId: z.string(),
        validModelIds: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return PlanModel.pruneAllowedModelsForProvider(
        ctx.serverDB,
        input.providerId,
        input.validModelIds,
      );
    }),

  toggleProviderModel: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        modelId: z.string(),
        providerId: z.string(),
        type: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const aiModelModel = new AiModelModel(ctx.serverDB, ctx.userId);
      await aiModelModel.toggleModelEnabled({
        enabled: input.enabled,
        id: input.modelId,
        providerId: input.providerId,
        type: input.type as any,
      });
      return { success: true as const };
    }),

  batchToggleProviderModels: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        modelIds: z.array(z.string()),
        providerId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const aiModelModel = new AiModelModel(ctx.serverDB, ctx.userId);
      await aiModelModel.batchToggleAiModels(input.providerId, input.modelIds, input.enabled);
      return { success: true as const };
    }),

  updateModelCredits: adminProcedure
    .input(
      z.object({
        creditsPerMillionInputTokens: z.number().min(0).optional(),
        creditsPerMillionOutputTokens: z.number().min(0).optional(),
        creditsPerRequest: z.number().min(0).optional(),
        modelId: z.string(),
        providerId: z.string(),
        videoCreditsPerSecond: z.number().min(0).optional(),
        videoCreditsPerSecondByResolution: z.record(z.string(), z.number().min(0)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const aiModelModel = new AiModelModel(ctx.serverDB, ctx.userId);
      const existing = await aiModelModel.findByIdAndProvider(input.modelId, input.providerId);
      const prev = (existing?.pricing as Record<string, unknown>) || {};
      const pricing: Record<string, unknown> = { ...prev };

      if (input.creditsPerRequest !== undefined) {
        pricing.creditsPerRequest = input.creditsPerRequest;
      }
      if (input.creditsPerMillionInputTokens !== undefined) {
        pricing.creditsPerMillionInputTokens = input.creditsPerMillionInputTokens;
      }
      if (input.creditsPerMillionOutputTokens !== undefined) {
        pricing.creditsPerMillionOutputTokens = input.creditsPerMillionOutputTokens;
      }
      if (input.videoCreditsPerSecond !== undefined) {
        pricing.videoCreditsPerSecond = input.videoCreditsPerSecond;
      }
      if (input.videoCreditsPerSecondByResolution !== undefined) {
        pricing.videoCreditsPerSecondByResolution = input.videoCreditsPerSecondByResolution;
      }

      await aiModelModel.update(input.modelId, input.providerId, { pricing } as any);
      return { pricing, success: true as const };
    }),

  // Per-model supported resolutions for video generation. Saved into the
  // model's parameters jsonb as { resolution: { default, enum } }, which
  // deep-merges over the model-bank schema (mergeArrayById) and flows to the
  // frontend video page, whose resolution tabs render exactly this enum.
  // Empty list resets to the default schema behaviour.
  updateModelResolution: adminProcedure
    .input(
      z.object({
        modelId: z.string(),
        providerId: z.string(),
        resolutions: z.array(z.string().min(1).max(24)).max(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const aiModelModel = new AiModelModel(ctx.serverDB, ctx.userId);
      const existing = await aiModelModel.findByIdAndProvider(input.modelId, input.providerId);
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '模型不存在' });
      }

      const parameters = { ...(existing.parameters as Record<string, unknown>) };
      if (input.resolutions.length === 0) {
        delete parameters.resolution;
      } else {
        parameters.resolution = {
          default: input.resolutions[0],
          enum: input.resolutions,
        };
        // The video page's schema parser requires the `prompt` key (the only
        // mandatory one in VideoModelParamsMetaSchema) — gateway models start
        // from an empty parameters object, and without it the whole schema
        // fails to parse and falls back to the generic resolutions.
        if (!parameters.prompt) {
          parameters.prompt = { default: '' };
        }
      }

      await aiModelModel.update(input.modelId, input.providerId, { parameters } as any);
      return { parameters, success: true as const };
    }),

  // ===== Platform Skills (admin upload, users can consume) =====
  createSkill: adminProcedure
    .input(
      z.object({
        content: z.string().min(1),
        description: z.string().min(1),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const importer = new SkillImporter(ctx.serverDB, ctx.userId);
      try {
        return await importer.createUserSkill(input);
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error?.message || 'Failed to create skill',
        });
      }
    }),

  importSkillFromZip: adminProcedure
    .input(z.object({ zipFileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const importer = new SkillImporter(ctx.serverDB, ctx.userId);
      try {
        return await importer.importFromZip(input);
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error?.message || 'Failed to import skill',
        });
      }
    }),

  importSkillFromUrl: adminProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const importer = new SkillImporter(ctx.serverDB, ctx.userId);
      try {
        return await importer.importFromUrl(input);
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error?.message || 'Failed to import skill from URL',
        });
      }
    }),

  // ===== Email (SMTP) Configuration =====
  getEmailConfig: adminProcedure.query(async ({ ctx }) => {
    const model = new SystemConfigModel(ctx.serverDB);
    const cfg = (await model.getEmailConfig()) || ({} as Partial<EmailSmtpConfig>);
    return {
      enabled: cfg.enabled ?? false,
      from: cfg.from || '',
      hasPass: Boolean(cfg.pass),
      hasResendApiKey: Boolean(cfg.resendApiKey),
      host: cfg.host || '',
      port: cfg.port ?? 465,
      provider: cfg.provider || 'nodemailer',
      requireVerification: cfg.requireVerification ?? false,
      secure: cfg.secure ?? true,
      user: cfg.user || '',
    } satisfies Partial<EmailSmtpConfig> & {
      hasPass: boolean;
      hasResendApiKey: boolean;
    };
  }),

  updateEmailConfig: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        from: z.string().optional(),
        host: z.string().optional(),
        pass: z.string().optional(), // empty = keep existing
        port: z.number().int().min(1).max(65535).optional(),
        provider: z.enum(['nodemailer', 'resend']).optional(),
        requireVerification: z.boolean().optional(),
        resendApiKey: z.string().optional(),
        secure: z.boolean().optional(),
        user: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = new SystemConfigModel(ctx.serverDB);
      const existing = (await model.getEmailConfig()) || ({} as Partial<EmailSmtpConfig>);
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();

      let pass = existing.pass;
      if (input.pass) {
        pass = await gateKeeper.encrypt(input.pass);
      }

      let resendApiKey = existing.resendApiKey;
      if (input.resendApiKey) {
        resendApiKey = await gateKeeper.encrypt(input.resendApiKey);
      }

      const next: EmailSmtpConfig = {
        enabled: input.enabled,
        from: input.from ?? existing.from ?? '',
        host: input.host ?? existing.host ?? '',
        pass,
        port: input.port ?? existing.port ?? 465,
        provider: input.provider ?? existing.provider ?? 'nodemailer',
        requireVerification: input.requireVerification ?? existing.requireVerification ?? false,
        resendApiKey,
        secure: input.secure ?? existing.secure ?? true,
        user: input.user ?? existing.user ?? '',
      };

      await model.setEmailConfig(next, ctx.userId);
      return { success: true as const };
    }),

  // ===== Storage (image host) Configuration =====
  getStorageConfig: adminProcedure.query(async ({ ctx }) => {
    const model = new SystemConfigModel(ctx.serverDB);
    const cfg = (await model.getImageHostConfig()) || ({} as Partial<StorageImageHostConfig>);
    return {
      enabled: cfg.enabled ?? false,
      expiration: cfg.expiration ?? 0,
      hasApiKey: Boolean(cfg.apiKey),
      provider: cfg.provider ?? ('imgbb' as const),
    };
  }),

  updateStorageConfig: adminProcedure
    .input(
      z.object({
        apiKey: z.string().optional(), // empty = keep existing
        enabled: z.boolean(),
        expiration: z.number().int().min(0).max(15_552_000).optional(),
        provider: z.enum(['imgbb', 'see']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = new SystemConfigModel(ctx.serverDB);
      const existing =
        (await model.getImageHostConfig()) || ({} as Partial<StorageImageHostConfig>);
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();

      let apiKey = existing.apiKey;
      // 服务商切换后旧 Key 不再适用,要求重新填写
      const provider = input.provider ?? existing.provider ?? 'imgbb';
      if (provider !== (existing.provider ?? 'imgbb')) apiKey = undefined;
      if (input.apiKey) {
        apiKey = await gateKeeper.encrypt(input.apiKey);
      }

      const next: StorageImageHostConfig = {
        apiKey,
        enabled: input.enabled,
        expiration: input.expiration ?? existing.expiration ?? 0,
        hasApiKey: Boolean(apiKey),
        provider,
      };

      await model.setImageHostConfig(next, ctx.userId);
      return { success: true as const };
    }),

  testStorageConfig: adminProcedure.mutation(async ({ ctx }) => {
    // 1x1 transparent PNG; verifies the configured key end-to-end
    const PNG_1PX = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    try {
      const url = await uploadImageToImageHost(ctx.serverDB, {
        buffer: PNG_1PX,
        mime: 'image/png',
      });
      return { message: `图床配置校验通过：${url}`, success: true as const };
    } catch (error: any) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error?.message || '校验失败' });
    }
  }),

  testEmailConfig: adminProcedure
    .input(z.object({ to: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const emailService = await EmailService.createFromSystemConfig(ctx.serverDB);
        await emailService.verify();
        await emailService.sendMail({
          html: `<p>这是一封来自管理后台的测试邮件，说明 SMTP 配置正常。</p><p>时间：${new Date().toISOString()}</p>`,
          subject: '【测试】邮箱配置验证成功',
          text: `这是一封来自管理后台的测试邮件，说明 SMTP 配置正常。时间：${new Date().toISOString()}`,
          to: input.to,
        });
        return { success: true as const };
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error?.message || '发送测试邮件失败，请检查 SMTP 配置',
        });
      }
    }),

  // ===== Payment (Shouqianba / 收钱吧) Configuration =====
  getPaymentConfig: adminProcedure.query(async ({ ctx }) => {
    const model = new SystemConfigModel(ctx.serverDB);
    const cfg = (await model.getShouqianbaConfig()) || ({} as Partial<ShouqianbaConfig>);
    return {
      appId: cfg.appId || '',
      enabled: cfg.enabled ?? false,
      env: cfg.env || 'sandbox',
      hasTerminalKey: Boolean(cfg.terminalKey),
      hasVendorKey: Boolean(cfg.vendorKey),
      notifyUrl: cfg.notifyUrl || '',
      payways: cfg.payways || ['alipay', 'wechat'],
      remark: cfg.remark || '',
      returnUrl: cfg.returnUrl || '',
      terminalSn: cfg.terminalSn || '',
      vendorSn: cfg.vendorSn || '',
    };
  }),

  updatePaymentConfig: adminProcedure
    .input(
      z.object({
        appId: z.string().optional(),
        enabled: z.boolean(),
        env: z.enum(['sandbox', 'production']).optional(),
        notifyUrl: z.string().optional(),
        payways: z.array(z.enum(['alipay', 'wechat', 'unionpay'])).optional(),
        remark: z.string().optional(),
        returnUrl: z.string().optional(),
        terminalKey: z.string().optional(),
        terminalSn: z.string().optional(),
        vendorKey: z.string().optional(),
        vendorSn: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = new SystemConfigModel(ctx.serverDB);
      const existing = (await model.getShouqianbaConfig()) || ({} as Partial<ShouqianbaConfig>);
      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();

      let vendorKey = existing.vendorKey;
      if (input.vendorKey) vendorKey = await gateKeeper.encrypt(input.vendorKey);

      let terminalKey = existing.terminalKey;
      if (input.terminalKey) terminalKey = await gateKeeper.encrypt(input.terminalKey);

      const next: ShouqianbaConfig = {
        appId: input.appId ?? existing.appId ?? '',
        deviceId: existing.deviceId,
        enabled: input.enabled,
        env: input.env ?? existing.env ?? 'sandbox',
        notifyUrl: input.notifyUrl ?? existing.notifyUrl ?? '',
        payways: input.payways ?? existing.payways ?? ['alipay', 'wechat'],
        remark: input.remark ?? existing.remark,
        returnUrl: input.returnUrl ?? existing.returnUrl ?? '',
        terminalKey,
        terminalSn: input.terminalSn ?? existing.terminalSn ?? '',
        vendorKey,
        vendorSn: input.vendorSn ?? existing.vendorSn ?? '',
      };

      await model.setShouqianbaConfig(next, ctx.userId);
      return { success: true as const };
    }),

  testPaymentConfig: adminProcedure.mutation(async ({ ctx }) => {
    const model = new SystemConfigModel(ctx.serverDB);
    const cfg = await model.getShouqianbaConfig();
    if (!cfg?.enabled) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '请先启用并保存收钱吧配置' });
    }
    if (!cfg.appId || !cfg.vendorSn) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '请完整填写 appId / vendorSn',
      });
    }
    if (!cfg.vendorKey) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '请配置 vendorKey',
      });
    }
    if (!cfg.terminalSn || !cfg.terminalKey) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '终端未激活，请先使用激活码激活终端',
      });
    }
    return {
      message: '配置完整，终端已激活',
      success: true as const,
    };
  }),

  activateTerminal: adminProcedure
    .input(z.object({ activationCode: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const model = new SystemConfigModel(ctx.serverDB);
      const existing = (await model.getShouqianbaConfig()) || ({} as Partial<ShouqianbaConfig>);

      if (!existing.appId || !existing.vendorSn || !existing.vendorKey) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '请先保存 appId / vendorSn / vendorKey',
        });
      }

      const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
      const decrypted = await gateKeeper.decrypt(existing.vendorKey);
      const plainVendorKey = decrypted.plaintext;

      const client = new ShouqianbaClient({
        ...existing,
        vendorKey: plainVendorKey,
      } as ShouqianbaConfig);

      const { terminalSn, terminalKey, deviceId } = await client.activate(input.activationCode);

      const encryptedTerminalKey = await gateKeeper.encrypt(terminalKey);

      const next: ShouqianbaConfig = {
        ...existing,
        deviceId,
        terminalKey: encryptedTerminalKey,
        terminalSn,
      } as ShouqianbaConfig;

      await model.setShouqianbaConfig(next, ctx.userId);

      return {
        message: '终端激活成功',
        success: true as const,
        terminalSn,
      };
    }),

  // ===== Coupons =====
  listCoupons: adminProcedure.query(async ({ ctx }) => {
    const model = new CouponModel(ctx.serverDB);
    return model.list({ limit: 200 });
  }),

  createCoupon: adminProcedure
    .input(
      z.object({
        active: z.boolean().default(true),
        code: z.string().min(2).max(32),
        description: z.string().optional(),
        endsAt: z.string().datetime().optional().nullable(),
        maxDiscount: z.number().min(0).optional().nullable(),
        minAmount: z.number().min(0).optional().nullable(),
        name: z.string().min(1).max(128),
        perUserLimit: z.number().int().min(0).optional().nullable(),
        scope: z.enum(['subscription', 'topup', 'all']).default('all'),
        startsAt: z.string().datetime().optional().nullable(),
        totalLimit: z.number().int().min(0).optional().nullable(),
        type: z.enum(['percent', 'fixed']),
        value: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = new CouponModel(ctx.serverDB);
      const existing = await model.findByCode(input.code);
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: '优惠码已存在' });
      }
      if (input.type === 'percent' && input.value > 100) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '折扣百分比不能超过 100' });
      }
      return model.create({
        active: input.active,
        code: input.code,
        createdBy: ctx.userId,
        description: input.description,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        maxDiscount: input.maxDiscount != null ? String(input.maxDiscount) : null,
        minAmount: input.minAmount != null ? String(input.minAmount) : null,
        name: input.name,
        perUserLimit: input.perUserLimit ?? 1,
        scope: input.scope,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        totalLimit: input.totalLimit ?? null,
        type: input.type,
        value: String(input.value),
      });
    }),

  updateCoupon: adminProcedure
    .input(
      z.object({
        active: z.boolean().optional(),
        description: z.string().optional().nullable(),
        endsAt: z.string().datetime().optional().nullable(),
        id: z.string(),
        maxDiscount: z.number().min(0).optional().nullable(),
        minAmount: z.number().min(0).optional().nullable(),
        name: z.string().min(1).max(128).optional(),
        perUserLimit: z.number().int().min(0).optional().nullable(),
        scope: z.enum(['subscription', 'topup', 'all']).optional(),
        startsAt: z.string().datetime().optional().nullable(),
        totalLimit: z.number().int().min(0).optional().nullable(),
        type: z.enum(['percent', 'fixed']).optional(),
        value: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const model = new CouponModel(ctx.serverDB);
      const patch: any = { ...rest };
      if (rest.value != null) patch.value = String(rest.value);
      if (rest.minAmount !== undefined)
        patch.minAmount = rest.minAmount != null ? String(rest.minAmount) : null;
      if (rest.maxDiscount !== undefined)
        patch.maxDiscount = rest.maxDiscount != null ? String(rest.maxDiscount) : null;
      if (rest.startsAt !== undefined)
        patch.startsAt = rest.startsAt ? new Date(rest.startsAt) : null;
      if (rest.endsAt !== undefined) patch.endsAt = rest.endsAt ? new Date(rest.endsAt) : null;
      const row = await model.update(id, patch);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: '优惠券不存在' });
      return row;
    }),

  deleteCoupon: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await new CouponModel(ctx.serverDB).remove(input.id);
      return { success: true as const };
    }),

  // ===== Dashboard Stats =====
  getDashboardStats: adminProcedure
    .input(
      z.object({
        from: z.string().optional(), // ISO date
        to: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        and: a,
        count: cnt,
        desc: d,
        eq: e,
        gte,
        lte,
        sql: s,
        sum,
      } = await import('drizzle-orm');
      const { users: usersT, paymentOrders, creditLedgers } = await import('@/database/schemas');

      const db = ctx.serverDB;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const fromDate = input.from ? new Date(input.from) : undefined;
      const toDate = input.to ? new Date(new Date(input.to).setHours(23, 59, 59, 999)) : undefined;

      // total users
      const [{ totalUsers }] = await db.select({ totalUsers: cnt() }).from(usersT);

      // new users today
      const [{ newUsersToday }] = await db
        .select({ newUsersToday: cnt() })
        .from(usersT)
        .where(gte(usersT.createdAt, todayStart));

      // new users in range
      const rangeConds = [
        fromDate ? gte(usersT.createdAt, fromDate) : undefined,
        toDate ? lte(usersT.createdAt, toDate) : undefined,
      ].filter(Boolean) as any[];
      const [{ newUsersInRange }] = await db
        .select({ newUsersInRange: cnt() })
        .from(usersT)
        .where(rangeConds.length > 0 ? a(...rangeConds) : undefined);

      // paid orders stats (subscription)
      const subConds = [
        e(paymentOrders.status, 'paid'),
        e(paymentOrders.orderType, 'subscription'),
        gte(paymentOrders.paidAt, todayStart),
      ];
      const [subToday] = await db
        .select({
          count: cnt(),
          total: sum(paymentOrders.amount),
        })
        .from(paymentOrders)
        .where(a(...subConds));

      // topup orders today
      const topupConds = [
        e(paymentOrders.status, 'paid'),
        e(paymentOrders.orderType, 'topup'),
        gte(paymentOrders.paidAt, todayStart),
      ];
      const [topupToday] = await db
        .select({
          count: cnt(),
          total: sum(paymentOrders.amount),
        })
        .from(paymentOrders)
        .where(a(...topupConds));

      // All paid orders in range
      const orderRangeConds = [
        e(paymentOrders.status, 'paid'),
        fromDate ? gte(paymentOrders.paidAt, fromDate) : undefined,
        toDate ? lte(paymentOrders.paidAt, toDate) : undefined,
      ].filter(Boolean) as any[];
      const [totalOrders] = await db
        .select({
          count: cnt(),
          total: sum(paymentOrders.amount),
        })
        .from(paymentOrders)
        .where(a(...orderRangeConds));

      // User credit consumption ranking in range (chat/image/video deductions from ledger)
      const ledgerConds = [
        s`${creditLedgers.amount} < 0`,
        fromDate ? gte(creditLedgers.createdAt, fromDate) : undefined,
        toDate ? lte(creditLedgers.createdAt, toDate) : undefined,
      ].filter(Boolean) as any[];

      const ranking = await db
        .select({
          consumed: s<number>`ABS(SUM(${creditLedgers.amount}))`,
          userId: creditLedgers.userId,
        })
        .from(creditLedgers)
        .where(a(...ledgerConds))
        .groupBy(creditLedgers.userId)
        .orderBy(d(s`ABS(SUM(${creditLedgers.amount}))`))
        .limit(20);

      // enrich with email
      const userIds = ranking.map((r) => r.userId);
      const userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { inArray } = await import('drizzle-orm');
        const rows = await db
          .select({ email: usersT.email, id: usersT.id, username: usersT.username })
          .from(usersT)
          .where(inArray(usersT.id, userIds));
        for (const r of rows) userMap[r.id] = r.email || r.username || r.id;
      }

      return {
        newUsersInRange: Number(newUsersInRange),
        newUsersToday: Number(newUsersToday),
        ranking: ranking.map((r) => ({
          consumed: Number(r.consumed),
          email: userMap[r.userId] || r.userId,
          userId: r.userId,
        })),
        subOrdersToday: { count: Number(subToday?.count ?? 0), total: subToday?.total ?? '0' },
        topupOrdersToday: {
          count: Number(topupToday?.count ?? 0),
          total: topupToday?.total ?? '0',
        },
        totalOrdersInRange: {
          count: Number(totalOrders?.count ?? 0),
          total: totalOrders?.total ?? '0',
        },
        totalUsers: Number(totalUsers),
      };
    }),

  // ===== Admin Notifications (broadcast) =====
  adminBroadcastNotification: adminProcedure
    .input(
      z.object({
        actionUrl: z.string().optional(),
        category: z.string().default('announcement'),
        content: z.string().min(1),
        title: z.string().min(1),
        type: z.string().default('announcement'),
        userIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { gte } = await import('drizzle-orm');
      const { users: usersT, notifications } = await import('@/database/schemas');
      const db = ctx.serverDB;

      let targetIds: string[] = input.userIds || [];
      if (!targetIds.length) {
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 2);
        const rows = await db
          .select({ id: usersT.id })
          .from(usersT)
          .where(gte(usersT.createdAt, cutoff));
        targetIds = rows.map((r) => r.id);
      }

      // Write ONE history record BEFORE inserting user notifications
      const batchId = `adm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const model = new SystemConfigModel(db);
      const historyRecord = {
        actionUrl: input.actionUrl,
        batchId,
        category: input.category,
        content: input.content,
        createdAt: new Date().toISOString(),
        title: input.title,
        total: targetIds.length,
        type: input.type,
      };
      // Each broadcast gets its own system_config key; no array manipulation → no race condition
      await model.set(`admin.announcement.${batchId}`, historyRecord as any, {
        description: 'Admin broadcast notification',
        updatedBy: ctx.userId,
      });

      // Bulk insert user notifications
      let sent = 0;
      for (const userId of targetIds) {
        try {
          await db
            .insert(notifications)
            .values({
              actionUrl: input.actionUrl,
              category: input.category,
              content: input.content,
              dedupeKey: `${batchId}-${userId}`,
              title: input.title,
              type: input.type,
              userId,
            })
            .onConflictDoNothing();
          sent++;
        } catch {
          /* skip */
        }
      }

      // Update the sent count on the history record
      await model.set(`admin.announcement.${batchId}`, { ...historyRecord, sent } as any, {
        description: 'Admin broadcast notification',
        updatedBy: ctx.userId,
      });

      return { sent, total: targetIds.length };
    }),

  adminListNotifications: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { like, desc: dDesc } = await import('drizzle-orm');
      const { systemConfigs } = await import('@/database/schemas');
      const db = ctx.serverDB;
      const { page, pageSize } = input;

      const [{ total }] = await db
        .select({ total: (await import('drizzle-orm')).count() })
        .from(systemConfigs)
        .where(like(systemConfigs.key, 'admin.announcement.%'));

      const rows = await db
        .select()
        .from(systemConfigs)
        .where(like(systemConfigs.key, 'admin.announcement.%'))
        .orderBy(dDesc(systemConfigs.updatedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        notifications: rows.map((r) => ({
          ...(r.value as any),
          id: r.key,
          createdAt: (r.value as any).createdAt ?? r.createdAt,
        })),
        total: Number(total),
      };
    }),

  // ===== Terms & Privacy =====
  getLegalContent: adminProcedure.query(async ({ ctx }) => {
    const model = new SystemConfigModel(ctx.serverDB);
    const data = await model.get<{ privacy?: string; terms?: string }>('legal.content');
    return { privacy: data?.privacy ?? '', terms: data?.terms ?? '' };
  }),

  setLegalContent: adminProcedure
    .input(
      z.object({
        privacy: z.string(),
        terms: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = new SystemConfigModel(ctx.serverDB);
      await model.set('legal.content', { privacy: input.privacy, terms: input.terms } as any, {
        description: 'Terms of Service and Privacy Policy',
        updatedBy: ctx.userId,
      });
      return { success: true };
    }),

  // ===== Admin Changelog =====
  getChangelogConfig: adminProcedure.query(async ({ ctx }) => {
    const model = new SystemConfigModel(ctx.serverDB);
    const data = await model.get<{ entries?: any[] }>('changelog.admin');
    return { entries: data?.entries ?? [] };
  }),

  setChangelogConfig: adminProcedure
    .input(
      z.object({
        entries: z.array(
          z.object({
            content: z.string().min(1),
            date: z.string(),
            id: z.string().min(1),
            image: z.string().optional(),
            title: z.string().min(1),
            versionRange: z.array(z.string()).optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = new SystemConfigModel(ctx.serverDB);
      await model.set('changelog.admin', { entries: input.entries } as any, {
        description: 'Admin-configured changelog entries',
        updatedBy: ctx.userId,
      });
      return { entries: input.entries, success: true as const };
    }),

  // ===== Referral policy =====
  getReferralPolicy: adminProcedure.query(async ({ ctx }) => {
    return loadReferralPolicy(ctx.serverDB);
  }),

  adminListReferralRewards: adminProcedure
    .input(
      z.object({
        inviteeId: z.string().optional(),
        inviterId: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { and: a2, count: c2, desc: d2, eq: e2, inArray: ia2 } = await import('drizzle-orm');
      const { referralRewards, users: usersT } = await import('@/database/schemas');
      const db = ctx.serverDB;
      const { page, pageSize, inviterId, inviteeId } = input;
      const conds: any[] = [];
      if (inviterId) conds.push(e2(referralRewards.inviterId, inviterId));
      if (inviteeId) conds.push(e2(referralRewards.inviteeId, inviteeId));
      const where = conds.length > 0 ? a2(...conds) : undefined;
      const [{ total }] = await db.select({ total: c2() }).from(referralRewards).where(where);
      const rows = await db
        .select({
          createdAt: referralRewards.createdAt,
          credits: referralRewards.credits,
          id: referralRewards.id,
          inviteeEmail: usersT.email,
          inviteeId: referralRewards.inviteeId,
          inviterId: referralRewards.inviterId,
          orderId: referralRewards.orderId,
          rate: referralRewards.rate,
          spendAmount: referralRewards.spendAmount,
          status: referralRewards.status,
        })
        .from(referralRewards)
        .leftJoin(usersT, e2(usersT.id, referralRewards.inviteeId))
        .where(where)
        .orderBy(d2(referralRewards.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      // get inviter emails
      const inviterIds = [...new Set(rows.map((r) => r.inviterId))];
      const inviterMap: Record<string, string> = {};
      if (inviterIds.length > 0) {
        const inv = await db
          .select({ email: usersT.email, id: usersT.id })
          .from(usersT)
          .where(ia2(usersT.id, inviterIds));
        for (const r of inv) inviterMap[r.id] = r.email || r.id;
      }
      return {
        rewards: rows.map((r) => ({ ...r, inviterEmail: inviterMap[r.inviterId] || r.inviterId })),
        total: Number(total),
      };
    }),

  setReferralPolicy: adminProcedure
    .input(
      z.object({
        defaultRate: z.number().min(0).max(1),
        enabled: z.boolean(),
        inviteeRegistrationCredits: z.number().min(0).default(0),
        registrationCredits: z.number().min(0).default(0),
        tiers: z
          .array(
            z.object({
              label: z.string().optional(),
              minAmount: z.number().min(0),
              rate: z.number().min(0).max(1),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tiers = [...input.tiers].sort((a, b) => b.minAmount - a.minAmount);
      const value: ReferralPolicyConfig = {
        defaultRate: input.defaultRate,
        enabled: input.enabled,
        inviteeRegistrationCredits: input.inviteeRegistrationCredits,
        registrationCredits: input.registrationCredits,
        tiers,
      };
      const model = new SystemConfigModel(ctx.serverDB);
      await model.set(SYSTEM_CONFIG_KEYS.referral, value as any, {
        description: 'Level-1 referral rebate policy',
        updatedBy: ctx.userId,
      });
      return value;
    }),
});
