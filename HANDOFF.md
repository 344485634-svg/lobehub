# ChatX (LobeHub 二开版) 项目交接说明

> 本包为完整源码快照，已去除：依赖 (node_modules)、构建产物 (.next)、本地数据库数据、`.env.local` 密钥配置。
> 接收方环境已就绪，按以下步骤即可跑起来二次开发。

## 1. 安装依赖

```bash
pnpm install # 依赖管理用 pnpm;跑脚本用 bun
```

## 2. 配置环境变量 (必做，密钥不随包提供)

```bash
cp .env.example.development .env.local
```

`.env.local` 至少需要填写 / 生成:

| 变量                       | 说明                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Postgres 连接串 (docker-compose 里有 postgres, 默认 `postgres://postgres:lobechat_password@localhost:5432/lobechat`)               |
| `DATABASE_DRIVER`          | 本机开发填 `node`                                                                                                                  |
| `KEY_VAULTS_SECRET`        | 32 字节 base64,**必须重新生成**(加密用户 API key 用), 生成:`openssl rand -base64 32`                                               |
| `JWKS_KEY`                 | RSA JWKS, 生成方式见 `.env.example` 注释 (异步任务鉴权用)                                                                          |
| `S3_*`                     | 对象存储；docker-compose 自带 RustFS (`http://localhost:9000`,bucket `lobe`),access key 用 compose 里的 `RUSTFS_ACCESS_KEY/SECRET` |
| `ENABLE_BUSINESS_FEATURES` | `1` 开启商业化特性 (订阅 / 积分 / 管理后台), 不需要则删                                                                            |
| `AUTH_EMAIL_VERIFICATION`  | 邮箱验证开关，开发期建议 `0`                                                                                                       |

> ⚠️ `KEY_VAULTS_SECRET` 一旦投入使用不可更换，否则已保存的第三方密钥全部无法解密。

## 3. 启动基础设施

```bash
bun run dev:docker # Postgres + Redis + RustFS(S3) + SearXNG
```

⚠️ **每次开发前确认 RustFS 存活**:`docker compose down` 会永久停掉它 (restart 策略救不回),
生图 / 上传会报 `TaskTimeout` 或 `socket hang up`。检查与修复:

```bash
docker ps | grep lobe-rustfs # 应显示 Up (healthy)
docker start lobe-rustfs     # 没起来就手动启动
```

## 4. 初始化数据库

```bash
bun run db:migrate # 执行 packages/database/migrations 全量迁移(126 个 SQL)
```

## 5. 启动开发

```bash
bun run dev # Next.js(:3010) + Vite SPA(:9876)
```

打开终端打印的地址注册首个账号，然后手工提权为管理员:

```sql
UPDATE users SET role='admin' WHERE email='<你的邮箱>';
```

重新登录后访问 `/admin` 进入管理后台 (模型 / 套餐 / 订阅 / 法务内容 / SMTP / 支付配置都在里面)。

## 6. 常用命令

```bash
bun run check       # lint + 相关测试 + 类型(不要跑 bun run test,全量要 10 分钟)
bun run db:generate # 改 schema 后生成迁移
bun run i18n        # 补全多语言(en-US/zh-CN 手写,其余脚本生成)
bun run dev:desktop # Electron 桌面端
```

## 7. 二次开发须知 (架构速览)

- **Monorepo**:`apps/`(cli/desktop/server)+ `packages/`(86 个 @lobechat/\* 包)+ `src/`(SPA + Next 路由)
- **数据流**:React UI → zustand store → services → TRPC(`apps/server/src/routers`, 分 lambda/async/mobile/tools)→ services → DB models → PostgreSQL
- **SPA 约定**:`src/routes/` 只放薄页面段，业务在 `src/features/<Domain>/`; 桌面路由必须同时改两份 `desktopRouter.config.*`(有 sync test 守卫)
- **品牌**: 所有品牌名在 `packages/business/const/src/branding.ts`(BRANDING_NAME 等), 当前为 ChatX
- **计费**: 订阅 / 积分 / 套餐在 `packages/business-server/src/`; 套餐过期处理 (积分作废 / 折扣取消 / 流水) 已内建
- **内部开发文档**:`dev-docs/` 目录有本项目全部历史改造记录 (白标化、计费、支付等),**接手前先读 `dev-docs/00-项目结构与修复记录.md`**
- **git**: 包内含完整 git 历史 (分支 `feature/phase1-auth-admin`); 按需更换 origin 指向自己的仓库

## 8. 已知状态

- 工作区含 115 个文件的未提交 WIP (计费 / 套餐页 UI 等), 功能可用但未定稿
- 支付仅接了收钱吧 (Shouqianba);Stripe 已下线
- 移动端应用未发布：下载页 "获取移动应用" 按钮目前提示 "即将上线", 打包移动端后替换 `src/features/Downloads/index.tsx` 中的 onClick 即可
- 套餐 "可用模型 / 模型折扣" 功能已被 `PLAN_ALLOWED_MODELS_ENABLED=false` 软禁用 (business-const), 置 true 恢复
