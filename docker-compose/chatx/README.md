# ChatX Docker 部署（本地实例）

一键启动完整 ChatX 栈：ChatX 应用（Next.js standalone + SPA）+ PostgreSQL（paradedb）+ Redis + RustFS（S3）+ SearXNG（联网搜索）。

```bash
# 构建 ChatX 应用镜像（首次约 30-50 分钟）
docker compose build app

# 后台启动全部服务（应用启动时会自动执行数据库迁移）
docker compose up -d
```

启动后：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| ChatX Web | http://localhost:3222 | 主应用 |
| RustFS Console | http://localhost:9003 | S3 控制台 |
| PostgreSQL | localhost:5433 | 库 `chatx`，用户 `postgres` |

注意事项：

- `.env` 内含随机生成的密钥（KEY_VAULTS_SECRET / AUTH_SECRET / RustFS Access/Secret），已被根 `.gitignore` 忽略，不要提交。
- `next` build 已通过 `src/libs/next/config/define-config.ts` 中的 `typescript.ignoreBuildErrors` 放行分支 WIP 类型错误；完整类型检查请用 `bun run check --type`。
- 换端口：改 `.env` 里的 `CHATX_PORT` / `RUSTFS_API_PORT` / `POSTGRES_PORT` 即可，`AUTH_TRUSTED_ORIGINS` 会随 `CHATX_PORT` 自动调整。
- 联网搜索（SearXNG）与 Redis 未对外暴露端口，仅栈内使用。
