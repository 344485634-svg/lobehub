import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AgentSkillModel } from '@/database/models/agentSkill';
import { AiModelModel } from '@/database/models/aiModel';
import { AiProviderModel } from '@/database/models/aiProvider';
import { ApiKeyModel } from '@/database/models/apiKey';
import { PlanModel } from '@/database/models/plan';
import { SubscriptionModel } from '@/database/models/subscription';
import { SystemConfigModel } from '@/database/models/systemConfig';
import { UserModel } from '@/database/models/user';
import { AiInfraRepos } from '@/database/repositories/aiInfra';
import type { EmailSmtpConfig, ShouqianbaConfig } from '@/database/schemas/systemConfig';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { EmailService } from '@/server/services/email';
import { SkillImporter } from '@/server/services/skill';

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
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return UserModel.listUsers(ctx.serverDB, input);
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
        creditsPerRequest: z.number().min(0),
        modelId: z.string(),
        providerId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const aiModelModel = new AiModelModel(ctx.serverDB, ctx.userId);
      const existing = await aiModelModel.findByIdAndProvider(input.modelId, input.providerId);
      const pricing = {
        ...(existing?.pricing as Record<string, unknown>),
        creditsPerRequest: input.creditsPerRequest,
      };
      await aiModelModel.update(input.modelId, input.providerId, { pricing } as any);
      return { success: true as const, pricing };
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
    if (!cfg.appId || !cfg.vendorSn || !cfg.terminalSn) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '请完整填写 appId / vendorSn / terminalSn',
      });
    }
    if (!cfg.vendorKey || !cfg.terminalKey) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '请配置 vendorKey 与 terminalKey',
      });
    }
    // 配置完整性校验通过；真实下单接口将在支付对接阶段实现
    return {
      message: '配置字段校验通过。下单/退款接口将在支付对接阶段启用。',
      success: true as const,
    };
  }),
});
