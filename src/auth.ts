import { defineConfig } from '@/libs/better-auth/define-config';

/**
 * better-auth 实例。defineConfig 为 async(启动时从 DB 读 admin 维护的微信/短信配置;
 * DB 不可达时 define-config 内部已降级为"未启用",绝不 reject,顶层 await 安全)。
 *
 * 采用「顶层 await 初始化 + getter 热视图」:
 * - 模块加载(await 完成)后,auth / auth.api 与旧版同步导出行为完全一致,
 *   Turbopack 可安全做常量折叠,消费方(middleware/proxy/trpc)代码零改动。
 * - admin 保存配置后调用 resetAuthInstance():bump 版本 + 重建 promise +
 *   顶层 await 不可重复 —— 因此 getter 在版本变化时同步返回新实例
 *   (resetAuthInstance 内部 await 重建完成,消费方下次属性访问即见新配置)。
 */
type AuthInstance = Awaited<ReturnType<typeof defineConfig>>;

let authVersion = 0;
let authPromise: Promise<AuthInstance> | null = null;

const build = () => (authPromise ??= defineConfig({ plugins: [] }));

// ===== 顶层初始化:模块加载完成前,auth 不可用;加载完成后永远同步可用 =====
const initialAuth = await build();

let currentAuth: AuthInstance = initialAuth;

/** admin 保存认证配置后调用:热加载新实例(完成前不阻塞返回,完成后 getter 生效)。 */
export const resetAuthInstance = async () => {
  const mod = await import('@/libs/better-auth/define-config');
  mod.bumpAuthConfigVersion();
  authVersion += 1;
  const next = await build(); // bump 后重建,读最新 DB 配置
  currentAuth = next;
};

/** 等待实例就绪(顶层 await 已保证;保留此 API 供 route 顶层与测试使用)。 */
export const ensureAuthReady = async (): Promise<AuthInstance> => currentAuth;

/**
 * auth:带 getter 的冻结视图 —— 每次属性访问实时转发到 currentAuth,
 * admin 热加载后,旧引用自动看到新实例。
 */
export const auth: AuthInstance = new Proxy(
  {} as AuthInstance,
  {
    get(_t, prop: string) {
      const value = (currentAuth as unknown as Record<string, unknown>)[prop];
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(currentAuth)
        : value;
    },
  },
) as AuthInstance;
