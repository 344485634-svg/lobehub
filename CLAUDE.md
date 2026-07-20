# LobeHub 项目开发文档

## 项目概述

LobeHub 是一个开源的 AI 聊天应用，支持多种 AI 模型、Agent 管理、文件上传、图片生成等功能。

- **版本**: 2.2.8
- **技术栈**: Next.js 16, React, TypeScript, PostgreSQL, Redis, S3
- **包管理器**: pnpm
- **运行时**: Node.js + Bun

## 项目目录结构

```
/Users/a1234/project/lobehub/
├── apps/
│   ├── server/          # 服务端代码
│   │   └── src/
│   │       ├── routers/ # tRPC 路由
│   │       ├── services/ # 业务服务
│   │       └── modules/  # 功能模块
│   └── web/             # Web 应用（可能）
├── packages/
│   ├── database/        # 数据库模型和迁移
│   │   ├── src/
│   │   └── migrations/  # 数据库迁移文件
│   └── trpc/            # tRPC 相关工具
├── docker-compose/      # Docker 编排配置
│   ├── dev/            # 开发环境配置
│   │   ├── docker-compose.yml
│   │   └── .env        # Docker 环境变量
│   ├── deploy/         # 部署配置
│   └── production/     # 生产环境配置
├── scripts/            # 开发脚本
│   └── migrateServerDB/ # 数据库迁移脚本
├── .env.local          # 本地环境变量（重要）
├── .env.example        # 环境变量示例
└── package.json        # 项目配置
```

## 环境配置

### 必需的环境变量 (.env.local)

```bash
# 数据库加密密钥（使用 openssl rand -base64 32 生成）
KEY_VAULTS_SECRET=a8W0WSpsDIauVxxFT2hYcDvK4xpXTVZgeKYbWjuZPFk=

# PostgreSQL 数据库配置
DATABASE_URL=postgres://postgres:lobechat_password@localhost:5432/lobechat
DATABASE_DRIVER=node  # 重要：本地开发必须使用 node 驱动，而非默认的 neon

# S3 存储配置（使用本地 RustFS）
S3_ACCESS_KEY_ID=9b2a4256242603876702b24aa80336b2
S3_SECRET_ACCESS_KEY=3407c442e80c604be3f95daee6d7853f883e870f077c507d75573530051eea5f
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=lobe
S3_PUBLIC_DOMAIN=http://localhost:9000
S3_ENABLE_PATH_STYLE=1

# JWT 异步任务密钥（RSA JWKS 格式）
# 注意：必须是包含 RSA 密钥的 JWKS 格式，不能是简单的字符串
JWKS_KEY={"keys":[{"kty":"RSA","n":"2anbhLeqQpwXx0IDLBfEteKffEsX3gWiOwn9Bd3C6FLU6cui4c7W0z3h2b7LgbBihBWnlqylvydSg04tm-tOcKG1jWp3EWLernwR1nAoHYSX6aIyhTudWyDXurouRwbD-gzFczFQMa8KgcPkOO2-BYD_9_A1h4TBAFLiu2kjmvXl2hnsq-Z--Ed5m0t3q8B8uCk94vF6-EMdC5bvdhETsnVmqIkYaDKzs5JUPlu42XfVBuGdDR56fvwBgYI82vTwxEnk8pDlbffJzuz4kCBwP2_xFIdhHYNtcsQyD68Lxin55m2DXbkINNRq4Ekxp5xTX12tud8NMPaBe7h7Id0nzQ","e":"AQAB","d":"LW0XLMgeBv_HsKS0v8eIHMOasFiFtybq2DJ59Xb2PgFHgTGoIUNHL1f7YjPBCiRzMwjH7JjEkLPWsyOmPiOqP7RoDQb6qYy-V6D6IgxPOvXYtIBO1eJ-sS2WCFjh3p3pWa6_qI5So8PZyAJHh6AKZ-Cnyyl9KnbIxtYFjsJfFXA4pDuPBYMRss15YTcWwmVLCthPtuPbZevg4e8LFn1d1nKJHXWCJSh0nSzwzrA9yGZVOERC8Y4nKO_Eayaba49OzwCIPB487FCgPRNziVaHNMxWWSKFcBieFFjuIO05wuWQMcf_YVLOzbw2865iCprNzQPu86itz_qbT2yjBqmuuw","p":"-bAoxSYhZFh5GdqqAmjYrfMxHka_vVyOeeuX8NRu5-FzhwqZeYp1NfAQl_1Av64XRyDcLxbQ3V_KehHc4ZpQOJhBSgaiY1PK_ANmuyME7lTQgIekhHiyj4IEQHreiYUixykCqSAQMDjj6aksx9Oa_83sJqkkTwZ5XkSi9YjhQHM","q":"3ypz9jr3XT1vuCrb37a-REpBOv-d8mTZxArIKcXtJRKOYUAFlTbqM2YskId_pH3enpn5k-xhpWloQCK_RyqLPSZKXy8UNmtqKCM3_fFI54iccTS5CaV16LZv646hnDPh_yi8gHf_G3xYoe8vZcHoqzHOI6iHuwTB0rQ3eaaPJr8","dp":"kfLqofLb6e_dOcObRLVMksFooK3yPhnwHkwcEGXcPiaGhRUpCOZqBRFCYdVjF6gHa0hF7DCF_iCUFi6C0kyFP8-fukmOekjsicrjLdgWdcmV5sti2xxCI6h4G8i2c-QipA_QwlM_ozBd6KM-zb9fBs-zjhWoZ5j9MKEmMCfGowk","dq":"xJvYMhRdHe4kYPKRZ5TOJ8frlBjjhEvJduew1OylMsYYXiFTSdRpnQLlPCfEEp055iztLp9Qn7QvvmFed0pKBYOYficx_YfArL_qcnWCr0kx2qKCarc1G-Ku066DPuSOtIelGuGdBRAV3gSlk1a0ry5f2BaADgnw4LsZLLnK4G0","qi":"pu6xlUH3g2CHalzWXggFlvbGPMh5Z7ra6MZTjEwb1PEH5HeKg7mY8sepv-4nx-juHRNGVTrwePF92vmXPFD0VQXokr4I9mudmFknHp0gL9__nMSrsQnE6qfLeX2ErtYTbVMjC7xvBK7lSk9Sm_ncxenqRimNOt27PsYA7V9Qq1A","alg":"RS256","use":"sig","kid":"8c24d32c9b05199550ad7b25aef95b30"}]}
```

### Docker 服务配置 (docker-compose/dev/.env)

```bash
LOBE_PORT=3210
RUSTFS_PORT=9000
LOBE_DB_NAME=lobechat
POSTGRES_PASSWORD=lobechat_password
RUSTFS_ACCESS_KEY=9b2a4256242603876702b24aa80336b2
RUSTFS_SECRET_KEY=3407c442e80c604be3f95daee6d7853f883e870f077c507d75573530051eea5f
```

## 开发环境搭建记录（2026-07-10）

### 1. 安装 Bun 运行时

**问题**: 项目依赖 Bun 运行时，但系统未安装
**错误**: `spawn bunx ENOENT`

**解决方案**:
```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
```

安装的版本: Bun 1.3.14

### 2. 配置数据库环境变量

**问题**: 缺少 `KEY_VAULTS_SECRET` 和 `DATABASE_URL`
**错误**: 
- `KEY_VAULTS_SECRET is not set`
- `DATABASE_URL is not set`

**解决方案**:
1. 生成加密密钥: `openssl rand -base64 32`
2. 创建 `.env.local` 文件
3. 配置数据库连接字符串
4. **重要**: 设置 `DATABASE_DRIVER=node` 用于本地 PostgreSQL

### 3. 启动 Docker 服务

**问题**: 需要 PostgreSQL、Redis、RustFS 等服务

**解决方案**:
```bash
# 1. 创建 docker-compose/dev/.env 文件
# 2. 启动服务
pnpm dev:docker

# 停止服务
pnpm dev:docker:down

# 重置服务（删除数据）
pnpm dev:docker:reset
```

**Docker 服务列表**:
- `lobe-postgres`: PostgreSQL 数据库 (端口 5432)
- `lobe-redis`: Redis 缓存 (端口 6379)
- `lobe-rustfs`: S3 兼容存储 (端口 9000)
- `lobe-searxng`: 搜索引擎 (端口 8180)

### 4. 执行数据库迁移

**问题**: 数据库表未创建，导致查询失败
**错误**: `Failed query: select ... from "users"`

**解决方案**:
```bash
# 确保环境变量已设置
DATABASE_URL=postgres://postgres:lobechat_password@localhost:5432/lobechat \
DATABASE_DRIVER=node \
KEY_VAULTS_SECRET=xxx \
pnpm db:migrate
```

**注意**: 迁移脚本默认使用 Neon WebSocket 驱动，本地必须设置 `DATABASE_DRIVER=node`

### 5. 配置 S3 存储

**问题**: 用户状态获取失败
**错误**: `S3 environment variables are not set completely`

**解决方案**:
生成访问密钥并配置 S3 相关环境变量（见上方配置）

### 6. 配置 JWT 异步任务密钥

**问题**: 图片生成等异步任务失败
**错误历史**:
1. `JWKS_KEY environment variable is not set`
2. `is not valid JSON` (使用了 base64 字符串)
3. `Cannot read properties of undefined (reading 'find')` (缺少 keys 数组)
4. 最终需要 RSA 密钥而非对称密钥

**正确的密钥格式**: RSA JWKS 格式，包含 `keys` 数组

**生成密钥脚本**:
```bash
node -e "
const crypto = require('crypto');
const { exportJWK } = require('jose');

(async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  
  const jwk = await exportJWK(crypto.createPrivateKey(privateKey));
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  jwk.kid = crypto.randomBytes(16).toString('hex');
  
  const jwks = {
    keys: [jwk]
  };
  
  console.log(JSON.stringify(jwks));
})();
"
```

## 常用命令

### 开发服务器

```bash
# 启动开发服务器
pnpm dev

# 构建项目
pnpm build

# 运行生产版本
pnpm start
```

### Docker 管理

```bash
# 启动所有开发服务
pnpm dev:docker

# 停止所有服务
pnpm dev:docker:down

# 重置服务（删除所有数据）
pnpm dev:docker:reset
```

### 数据库管理

```bash
# 执行数据库迁移
pnpm db:migrate

# 生成新的迁移文件
pnpm db:generate

# 重置数据库
pnpm db:reset
```

## 访问地址

- **应用主页**: http://localhost:3010
- **网络访问**: http://192.168.2.116:3010
- **Vite 开发服务器**: http://localhost:9876
- **RustFS 控制台**: http://localhost:9001
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **SearXNG**: http://localhost:8180

## 常见问题和解决方案

### 1. Agent 市场加载失败

**问题**: "加载模板失败。请稍后再试。"
**原因**: 默认的 Agent 市场 API (https://market.lobehub.com) 需要身份验证

**解决方案**: 
- 跳过入门引导，直接使用应用
- 手动创建自定义 Agent
- 或配置 OAuth 认证访问官方市场

### 2. 图片生成服务商配置

**推荐使用 liuma 官方服务商** (自建网关平台)

**问题**: 使用 OpenAI provider 代理 liuma 网关时，`gpt-image-2` 模型会出现参数格式不匹配错误 `400 Invalid size, allowed ratios: ...`

**原因**: 
- OpenAI 官方 API 的 `gpt-image-2` 使用分辨率参数 (`1024x1024`, `2048x2048` 等)
- liuma 网关的 `gpt-image-2` 使用比例参数 (`1:1`, `16:9`, `9:16` 等)
- 复用 `openai` provider 会导致参数 schema 对不上

**解决方案**: 
项目已新增专用的 `liuma` provider，为 liuma 网关定制了正确的模型参数 schema。

**配置步骤**:
1. 在 LobeHub 设置 → AI 服务商 → 添加自定义服务商
2. Provider ID: `liuma`
3. 显示名称: `liuma 官方` (或任意自定义名称)
4. API 端点: `https://api.liuma.ai/v1`
5. API Key: 填入 liuma 平台的 API 密钥
6. 添加模型: `gpt-image-2` (会自动匹配正确的 aspectRatio 参数 schema)

**liuma gpt-image-2 支持的比例**:
- 1:1 (正方形), 16:9 (横屏), 9:16 (竖屏)
- 4:3, 3:4, 3:2, 2:3
- 5:4, 4:5, 2:1, 1:2
- 21:9 (超宽), 9:21 (超窄)

**分辨率选项**: `1k` (默认), `2k`

### 3. 端口冲突

**问题**: Next.js 服务器已在运行

**解决方案**:
```bash
# 查找并终止占用端口的进程
lsof -ti:3010 | xargs kill -9

# 或者使用项目提供的命令
kill <PID>
```

### 4. Docker 服务未启动

**问题**: 数据库连接失败

**检查服务状态**:
```bash
docker ps

# 查看特定容器日志
docker logs lobe-postgres
docker logs lobe-rustfs
```

### 5. 依赖安装问题

**问题**: pnpm 警告或错误

**解决方案**:
```bash
# 清理缓存重新安装
rm -rf node_modules
pnpm install

# 如果还有问题，清理 pnpm 存储
pnpm store prune
pnpm install
```

## 开发注意事项

1. **始终在 lobehub 目录中运行命令**
   - 项目根目录: `/Users/a1234/project/lobehub`
   - 避免在父目录运行命令

2. **环境变量优先级**
   - `.env.local` > `.env.development.local` > `.env.development` > `.env`
   - 本地开发使用 `.env.local`
   - 不要提交 `.env.local` 到版本控制

3. **数据库迁移**
   - 修改数据库架构后必须运行 `pnpm db:migrate`
   - 迁移文件位于 `packages/database/migrations/`

4. **S3 存储**
   - 本地使用 RustFS 作为 S3 兼容存储
   - 文件存储在 Docker 卷中
   - 重置 Docker 会删除所有上传的文件

5. **Bun 运行时**
   - 项目依赖 Bun 用于开发脚本
   - 确保 Bun 在 PATH 中: `export PATH="$HOME/.bun/bin:$PATH"`

## 技术架构

### 前端
- **框架**: Next.js 16 (Turbopack)
- **UI**: React + TypeScript
- **状态管理**: tRPC + React Query
- **样式**: CSS-in-JS

### 后端
- **API**: tRPC (类型安全的 RPC)
- **数据库**: PostgreSQL (使用 Drizzle ORM)
- **缓存**: Redis
- **存储**: S3 兼容 (RustFS/MinIO)
- **认证**: Better Auth

### 开发工具
- **包管理**: pnpm
- **运行时**: Node.js + Bun
- **容器化**: Docker Compose
- **类型检查**: TypeScript

## 项目特点

1. **Monorepo 架构**: 使用 pnpm workspace 管理多个包
2. **类型安全**: 端到端 TypeScript + tRPC
3. **实时功能**: 支持 WebSocket 和 Server-Sent Events
4. **文件管理**: S3 兼容存储，支持文件上传和管理
5. **AI 集成**: 支持多种 AI 提供商（OpenAI, Anthropic, 等）
6. **图片生成**: 异步任务系统支持 AI 图片生成
7. **Agent 系统**: 自定义 AI Agent 和市场

## 维护建议

1. **定期备份数据库**
   ```bash
   docker exec lobe-postgres pg_dump -U postgres lobechat > backup.sql
   ```

2. **监控 Docker 容器健康状态**
   ```bash
   docker ps
   docker stats
   ```

3. **查看应用日志**
   - 开发服务器日志在终端输出
   - Docker 服务日志: `docker logs <container_name>`

4. **更新依赖**
   ```bash
   pnpm update
   ```

## 联系和支持

- **官方网站**: https://lobehub.com
- **GitHub**: https://github.com/lobehub/lobe-chat
- **文档**: 查看项目根目录的 README.md

---

**文档最后更新**: 2026-07-10  
**配置人**: Claude Code AI Assistant  
**项目版本**: 2.2.8
