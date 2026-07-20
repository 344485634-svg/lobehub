# 二次开发修改日志(CHANGELOG)

> 规则:每次修改后追加一条。格式见下方模板。
> 备份同步至仓库外 `/Users/a1234/project/.lobehub-dev-docs-backup/CHANGELOG.md`。

## 模板

```
### YYYY-MM-DD · 任务简述
- **改动文件**:
  - `path/to/file` — 一句话说明改了什么
- **验证**:
- **结果**:
- **备份**:
```

---

### 2026-07-15 · 第一阶段排障收尾:gpt-image-2 比例选择器持久修复

- **改动文件**:
  - `packages/model-bank/src/aiModels/index.ts` — barrel 导出 `gptImage2AspectRatioSchema`
  - `packages/model-runtime/src/providers/newapi/index.ts` — import 该 schema;新增 `MODEL_PARAMETERS_OVERRIDES`;`models()` 在交给 `processMultiProviderModelList` 前为 `gpt-image-2` 注入 aspectRatio schema
  - `packages/model-runtime/src/providers/newapi/index.test.ts` — 新增用例 `should override gpt-image-2 parameters with the aspect-ratio schema …`
  - DB:`ai_models` 表 `provider_id='newapi', id='gpt-image-2'` 行 `parameters` 改回 aspectRatio schema
- **验证**:
  - `pnpm type-check`(tsgo --noEmit)exit 0
  - `npx vitest run src/providers/newapi/index.test.ts` → 84 passed + 1 skip
  - DB SELECT:`newapi`/`gpt-image-2` 行 `uses_aspect_ratio=t, uses_size=f`
- **结果**:已持久(再点"拉取模型"不再覆盖);DB 当前行已恢复。Docker 全部 healthy;RustFS `/health` 200。
- **备注**:同期发现 `CLAUDE.md` 中 "liuma" provider 章节为可疑/虚构内容,代码库无对应实现,已提示用户审查,未采信执行。

---

<!-- 后续任务追加于此线之下 -->

### 2026-07-15 · 第一阶段任务:整体白标为「LM Studio」商业产品

**目标**:① 全站品牌 LobeHub/LobeChat → LM Studio(含首屏加载);② 删除所有跳转原项目 GitHub 的链接/按钮/引导,定位商业化产品,反馈改走应用内表单;③ 设置页 AI 服务商仅保留 newapi,显示名改「LIUMA 官方 API」,图标换 LM Studio logo,不动 id/runtime 保 API 调用;④ 用根目录 `liuma/` 的 favicon.ico + logo.png。

**改动文件**(按分组):
- **资产**:`liuma/favicon.ico` → 覆盖 `public/favicon.ico` + `public/favicon-32x32.ico`;`liuma/logo.png` → `public/logo.png`。
- **品牌常量(最高杠杆)**:`packages/business/const/src/branding.ts` — `BRANDING_NAME/ORG_NAME`→'LM Studio'、`BRANDING_LOGO_URL`→'/logo.png'、`LOBE_CHAT_CLOUD`→'LM Studio Cloud'、`SOCIAL_URL.github`→空;**保留 `BRANDING_PROVIDER='lobehub'`**(避免破坏官方技能作者匹配)。
- **硬编码品牌字符串**:`index.html`(首屏 splash 内联 SVG→`<img src="/logo.png">`)、`public/not-compatible.html`、`src/app/manifest.ts`(dev 分支)、`src/server/metadata.ts`(fallback desc)、`src/server/ld.ts`(多处+sameAs 去 github)、7 个邮件模板、`define-config.ts`(rpName)、`oidc-provider/config.ts`(client_name)、`mcpStore/action.ts`(userAgent)、AuthShell/Downloads/PluginDevModal/CommandMenu UI 字面量、`ConnectionMode.tsx`(LobeHub logo 组件→logo img)、`useControls.tsx`(officialTag Tooltip)。**保留**:`author === 'LobeHub'` 匹配点、`LobeHubProvider` 标识符、`LobeChat_Home` 持久化键、`LobeChatDatabase` 等类型名(改了会破坏运行)。
- **GitHub 引流清理**:`packages/const/src/url.ts`(GITHUB/GITHUB_ISSUES/FEEDBACK/RELEASES_URL/MORE_*/AGENTS_INDEX_GITHUB 全置空,OFFICIAL_* 保留)、`commercial_hide_github` 特性开关默认 true、CommandMenu(star-github+submit-issue 删除,反馈留 contactUs)、Follow(置 null)、About(删 GitHub 卡片)、provider Footer(隐藏)、mobile useCategory(反馈→`openFeedbackModal`)、community CreateButton(删"去GitHub提交"按钮)、DataImporter/Error + FileViewer/NotSupport(反馈→`openFeedbackModal`)、newapi 卡片 `url`(删)、社区 provider 列表/详情"查看源码"链接(删)。
- **多语言(18 语言 + `packages/locales/src/default`)**:value-only perl 替换 `LobeHub`/`LobeChat`→`LM Studio`(排除规则保护 key 末尾的 LobeHub 不被改);修复被误伤的中间 key `response.LobeHubModelDeprecated`(19 处恢复);**locale key 全部保留**(代码 `t()` 引用不变)。
- **设置页仅显示 newapi**:`ProviderGrid/index.tsx` + `ProviderMenu/List.tsx` 三段 list 加 `.filter(p => p.id === 'newapi')`(只在 UI 层,不动 selectors,不影响模型选择器等处的已启用模型调用)。
- **newapi 显示名+图标**:`packages/model-bank/src/modelProviders/newapi.ts` `name`→'LIUMA 官方 API';`Card.tsx`+`Item.tsx` 加 `id==='newapi'` 特判渲染 `<Avatar avatar={'/logo.png'}>`(走 custom 样式);**id/runtime/runtimeMap 不动**(API 调用不受影响)。
- **DB 清理**:删前 `pg_dump` 备份 ai_providers+ai_models → `.lobehub-dev-docs-backup/db-2026-07-15.sql`(37KB);删 liuma/lmstudio 孤立行(2 行,无 ai_models 依赖);newapi/gpt-image-2 完好(enabled=t,比例 schema 在)。

**验证**:
- `pnpm type-check`(tsgo --noEmit)**0 error**(经多轮修复:providers.ts 标识符误伤已回退、locale 中间 key 已恢复、社区文件 import 已清理)。
- `npx vitest run src/providers/newapi/index.test.ts src/core/openaiCompatibleFactory/createImage.test.ts` → **111 passed + 1 skip**,无回归。
- 936 个 locale JSON 全部可解析,`response.LobeHubModelDeprecated` 等 key 完整;残留 19 个 `LobeHub` 全是 `t()` 引用的 key(正确保留)。
- DB:剩余 provider 仅 anthropic/deepseek/newapi/openai;newapi/gpt-image-2 enabled=t。
- Docker 5 容器全 healthy。

**已知低优先残留(不影响运行,可选后续处理)**:
- 桌面端帮助菜单(macOS/windows/linux)硬编码 `help.githubRepo` + 反馈项指向原仓库(Electron 专用,web 运行不受影响)。
- `src/server/ld.ts` AUTHOR_LIST 含 arvinxx/canisminor/lobehub 创始人 GitHub 头像/URL(JSON-LD 结构化数据,非 UI)。
- 代码注释/test/DevPanel fixtures 含 github.com/lobehub 链接(非用户可见)。
- `ChatAppearance/LinkIconPreview` 演示链接、`WelcomeText` issue 号自动链接、`document-loaders` 报错文案、社区 markdown 链接解析器(功能性,非引流)。
- 非 GitHub 的 lobehub.com 链路(official-site/docs/blog/terms/privacy/subscription/BRANDING_EMAIL)仍指上游(用户未提供自有域名,清空有破坏 urlJoin 风险,留待用户给域名后统一替换)。
- builtin 技能 provider 'lobehub'/'LobeHub Skill' 组标签/图标仍显示 LobeHub(绑 `BRANDING_PROVIDER`,改名需同步改数据+比较点,风险大,留待用户决定)。
- "LobeHub Cloud"同步选项(ConnectionMode)图标已换 LM Studio logo、文案经 locale 改为"LM Studio Cloud",但仍指向 app.lobehub.com 云同步(自建用户不适用,可选移除整个选项)。

**备份**:仓库外 `/Users/a1234/project/.lobehub-dev-docs-backup/`(含 DB dump、文档)。

---

### 2026-07-15 · 品牌化遗漏补修(用户反馈 4 处)

用户测试后发现 4 处遗漏,逐个修复:
1. **对话助理名 "Lobe AI"→"LM Studio"**:`inbox.title`(18 语言 chat.json + `packages/locales/src/default/chat.ts`)及代码 fallback(AgentInfo/ShareModal/CommandMenu/useAgentMeta 等)广域 sed `Lobe AI`→`LM Studio`(带空格,不在 key/标识符中,安全;顺带把 persona/taskManager 等 prompt 里 AI 自称一并改,白标一致)。`INBOX.avatar` `/avatars/lobe-ai.png` 覆盖为 logo(助理形象白标)。
2. **自我介绍 "我是 Lobe"**:`packages/builtin-agents/src/agents/inbox/systemRole.ts` `You are Lobe`→`You are LM Studio`;`agent-builder/systemRole.ts` `You are Lobe...LobeHub`→`You are LM Studio...LM Studio`(AI 据 system prompt 自称,改后自我介绍为 LM Studio)。
3. **favicon**:暴力覆盖 `public/favicon*.ico`(16 个,含 dev 变体)+ `apple-touch-icon.png` + `public/icons/icon-*.png`(4 个 PWA)+ `avatars/lobe-ai.png` 为用户资产。注:`metadata.ts` icons 分支 isCustomBranding 时已用 `BRANDING_LOGO_URL`(/logo.png)。
4. **newapi 详情页名字+图标**:`src/routes/(main)/settings/provider/features/ProviderConfig/index.tsx` header 对 builtin 走 `ProviderCombine provider={id}`(=@lobehub/icons 的 NewAPI 图标+"New API",不读卡片 name);加 `id==='newapi'` 特判渲染 `<Avatar avatar={'/logo.png'}>` + `{name}`(='LIUMA 官方 API')。

**验证**:936 locale JSON 全可解析;`inbox.title` 已 "LM Studio";newapi/createImage 测试 111 passed 无回归;typecheck 见当日记录。

**备份**:仓库外备份已同步(见下)。

---

### 2026-07-15 · 设置"关于"移除 + 模型选择器只显示后台配置模型

用户反馈两点,修复:

1. **设置"关于"整块移除**:`src/routes/(main)/settings/hooks/useCategory.tsx` 删除 `SettingsTabs.About` 导航项(原受 `!hideDocs` 开关控制,现直接删项;不动 hideDocs 开关,避免误伤移动端 docs/feedback/changelog)。`/settings/about` 路由仍在(不链接,无害)。清理未用的 `Info` import。

2. **所有模型选择处只显示后台已启用配置模型,隐藏 model-bank 内置目录**:
   - **根因**:model-bank 内置模型/服务商默认 `enabled:true`;DB repo `getEnabledModels`(行 225)无 DB 记录时沿用内置默认 → 即使服务商未在 DB 启用,内置目录模型(openai gpt-4o、anthropic claude、dall-e 等,运行时 source='builtin')也进入 `enabledAiModels` → 出现在生图/对话/首页/Agent 等所有模型选择器。
   - **修复点**:`src/store/aiInfra/slices/aiProvider/action.ts` `useFetchAiProviderRuntimeState`(登录路径):构建 4 个 `enabled*ModelList`(chat/image/video/embedding)前,用 `userConfiguredAiModels = data.enabledAiModels.filter(m => m.source !== AiModelSourceEnum.Builtin)` 过滤副本,并按此重新派生 4 个 provider 列表(只留有非-builtin 模型的 provider,避免空 provider 组)。**`enabledAiModels` state 保持全量不动**(chat helper 能力检测 isCanUseVision/Video/Audio、tryMatchingProviderFrom provider 解析仍用全量,不受影响)。
   - **类型**:`packages/model-bank/src/types/aiModel.ts` `EnabledAiModel` 加 `source?: AiModelSourceType;`(运行时对象本有 source,类型补齐)。
   - **覆盖**:所有模型选择 UI 共用这 4 个 state 字段(生图 `enabledImageModelList`、对话/首页 `enabledChatModelList` via `useEnabledChatModels`、Agent 配置 `ModelSelect`、通用 ModelSelect、video/embedding),一改全改。
   - **DB 现状**:56 行 ai_models 全 `source='remote'`(newapi 网关拉取);启用的是 claude-haiku-4-5/claude-opus-4-7(chat)+ gpt-image-2(image)。过滤后选择器只显示这些,builtin 目录全隐藏。
   - **边界安全**:设置页模型启用流程(独立路径 `getAiProviderModelList`,合并内置+DB 不按 enabled 过滤)不受影响——用户仍能在设置页看到并启用内置目录模型;`getModelCard` 有 builtinAiModelList fallback 显示模型信息;社区/发现页独立;游客路径(未登录,独立分支)未动(本项目 auth 必需,无游客)。

**验证**:typecheck 见当日记录;newapi/createImage 测试不受影响(action.ts 在 src/store,非 model-runtime)。

**备份**:仓库外备份已同步。

---

### 2026-07-15 · 第二阶段评估 + 决策 + 2a 快速封闭化

**评估**:3 个 Explore agent 调研(社区模块全貌 / lobehub 链接排查 / 内容供给链),产出 `dev-docs/02-第二阶段评估-社区与资源模块.md`。

**用户 4 项决策**:① 社区市场→A 快速隐藏(showMarket=false,保留代码备用);② LobeHub connected-app Skills→移除改走 MCP;③ lobehub.com 非 GitHub 链路→现在清空成死链接;④ 产品形态→做桌面/CLI 客户端(移动 web 不做)。

**阶段 2a 执行(已完成,低风险)**:
- **隐藏社区入口**:`packages/app-config/src/featureFlags/schema.ts` `market: false`(→ showMarket=false,门控 `useNavLayout`/`MobileTabBar` 的 community 项,零代码隐藏)。
- **清空 lobehub.com 死链接**:`packages/const/src/url.ts`(OFFICIAL_URL/SITE/DOMAIN、CHANGELOG、PLUGINS_INDEX_URL、AGENTS_OFFICIAL_URL、BASE_PROVIDER_DOC_URL、DOWNLOAD_URL.* 全置空,派生的 DOCUMENTS/BLOG/PRIVACY/TERMS 等变相对死链不崩)+ `packages/business/const/src/branding.ts`(SOCIAL_URL medium/x/youtube 置空、BRANDING_EMAIL 置空)+ `src/app/[variants]/metadata.ts`(守卫 `metadataBase: OFFICIAL_URL ? new URL(OFFICIAL_URL) : undefined`,避免空 URL 抛错)。
- **桌面 Help 菜单清理**:`apps/desktop/src/main/menus/impls/{macOS,windows,linux}.ts` 删 visitWebsite(lobehub.com)/githubRepo/reportIssue(GitHub)3 项;对应 `.test.ts` 删过时断言用例。
- **CDN 资源(lobeobjects.space 视频/图标)**:2a 暂不处理(404 死链接,cosmetic),留待 2b/2c 自托管或随 connected-app 移除。

**验证**:全仓 `pnpm type-check` **0 error**(根 tsconfig 覆盖 web 改动);排查确认无 `new URL(<lobehub 常量>)` 崩溃风险(仅 metadata 一处已守卫)、OFFICIAL_URL/SITE 无 startsWith/origin 逻辑用法;桌面 tsc 报错均为 `Cannot find module 'electron'`(环境性,electron 类型未在此环境安装,非改动引入)。

**待办(2b,后续)**:用 builtin-agents/skills/tools 包注入开发者自有内容;SkillStore 改本地+内置;移除 LobeHub connected-app Skills 改走 MCP(lobe-skill-store tool / aiAgent marketService / SkillStore LobeHub&Skills&MCP Tab);onboarding 改接本地;`lobe-skill-store` tool 改本地搜索。

**备份**:仓库外 `/Users/a1234/project/.lobehub-dev-docs-backup/`(含 02 评估文档)。

---

### 2026-07-15 · 用户验证反馈修复(社区搜索残留 + 对话慢)

用户验证 2a 后反馈:① 设置"关于"已消失✓;② 社区首页隐藏了但**搜索里还在**;③ 对话/生图正常但**对话响应慢**。

**#2 社区搜索残留修复**:
- `packages/app-config/src/routes/index.ts` `getNavigableRoutes` 的 filter 移除 `'community'`(cmdk 可导航项不再含社区)。
- `apps/server/src/routers/lambda/search.ts` 加 `ENABLE_MARKET_SEARCH=false` const,门控 3 个市场搜索块(mcp/plugin/communityAgent)——搜索不再实时调 lobehub 市场 `DiscoverService.getAssistantList/getMcpList/getPluginList`;本地搜索(messages/topics/agents/files)保留。代码保留,设 true 可恢复。

**#3 对话慢根因+修复**:
- **根因**:`apps/server/src/services/aiAgent/index.ts` 的 `execAgent`(每条聊天消息都跑)line 2401 **无条件 `await this.marketService.getLobehubSkillManifests()`**——每条消息都同步等 lobehub 市场,lobehub 不可达时严重拖慢对话响应;**生图不走 execAgent 故快**(符合"生图正常、对话慢"的现象)。注:`enableLobehubSkill` 全局开关本已为 false(用户未配 MARKET_TRUSTED_CLIENT_*),但 execAgent 的调用未受其门控(无条件)。
- **修复**:加 `ENABLE_LOBEHUB_SKILL=false` const,门控该 fetch(`lobehubSkillManifests` 已 `let=[]`,跳过安全;下游对 `[]` 正常处理)。对应决策②"移除 LobeHub connected-app Skills 改走 MCP"。代码保留,设 true 可恢复。
- **未臆测处理**:`composioService.getComposioManifests()`(line 2419,同为每条消息 await)暂未门控——Composio SDK 无 API key 时可能已短路返回;若复测仍慢,再排查 Composio 或 newapi 网关延迟。

**验证**:`pnpm type-check` 全程 **0 error**(search.ts/routes/aiAgent 改动均通过)。

**备份**:仓库外备份已同步。

---

### 2026-07-16 · 修复视频生成 dreamina-seedance 已下架报错

**现象**:用户选 liuma 的 sora-2 生成视频,报错"模型 dreamina-seedance-2-0-260128 已下架"(用户 DB 里根本没启用此模型)。

**根因**:
- `src/store/video/slices/generationConfig/initialState.ts` 的硬编码默认 `DEFAULT_AI_VIDEO_MODEL='dreamina-seedance-2-0-260128'` + `DEFAULT_AI_VIDEO_PROVIDER=ModelProvider.LobeHub('lobehub')` —— dreamina-seedance 是已被重命名为 `doubao-seedance` 的旧 id,model-bank catalog 里**不存在**(volcengine.ts 里是 doubao-seedance)。
- 服务端 `apps/server/src/routers/lambda/video/index.ts:90-102` 的下架检查:**仅当 `provider===BRANDING_PROVIDER('lobehub')` 且模型不在 catalog 时**抛 `LobeHubModelDeprecated(requestedModel=model)`。默认 (lobehub, dreamina-seedance) 命中 → 报已下架。
- 即:视频 store 初始化/选择前的窗口里仍是默认 (lobehub, dreamina-seedance),提交时被服务端判下架。DB 里 newapi 的 sora-2、grok-imagine-video 均 enabled=t(source=remote,前一日过滤保留)。

**修复**:`src/store/video/slices/createVideo/action.ts` 的 `createVideo` 提交前加守卫——若当前 (provider,model) 不在 `enabledVideoModelList`(如初始化前的下架默认),自动切到第一个启用的视频模型(sora-2);`setModelAndProviderOnSelect` 内 `preserveVideoInputParams` 保留 prompt/参考图;首次后 lastSelected 持久化,后续自愈。无启用视频模型时提示"无可用服务商"并中止。import `aiProviderSelectors`/`getAiInfraStoreState`。

**未改**:DEFAULT_AI_VIDEO_MODEL 仍为已下架 dreamina-seedance(守卫已使提交路径无害;init 逻辑 useFetchAiVideoConfig step4 本就会选第一个启用模型 sora-2)。若需彻底换默认可后续再定。

**验证**:`pnpm type-check` 0 error。待用户复测:硬刷新 → 生成视频应直接用 sora-2,不再报下架。

**备份**:今日改动(createVideo/action.ts + CHANGELOG)已同步到仓库外备份。

---

### 2026-07-16 · 视频修复二轮:点 sora-2 不切 + 发送卡住(真根因)

用户复测反馈:点 sora-2 没切到对应模型、上方仍显示"即可创作"、发提示词一直没发送出去。

**真根因**:DB 里 newapi sora-2(remote 网关拉取)的 `parameters = {}`(空对象,**truthy**)。`normalizeVideoModel` 见 `model.parameters` truthy 就用 `{}`,不做 model-bank fallback。`getVideoModelAndDefaults` → `extractVideoDefaultValues({})` → `VideoModelParamsMetaSchema.parse({})` —— 该 schema 的 `prompt` 字段**必填**(非 optional)→ parse 缺 prompt **抛错**。于是:`setModelAndProviderOnSelect('sora-2','newapi')` 抛错 → 点 sora-2 不切;昨日加的 createVideo 守卫里自动切 sora-2 同样抛错 → `isCreating` 置 true 后未复位 → **发送卡住**。

**修复**:
- `src/store/video/slices/generationConfig/action.ts` `getVideoModelAndDefaults`:用 try/catch 包裹 `extractVideoDefaultValues`;抛错或缺 params 时**回退到默认视频 schema**(`initialGenerationConfigState.parametersSchema` = seedance20Params + `DEFAULT_VIDEO_GENERATION_PARAMETERS`)。选模型/生成不再因缺 params 抛错。import 两个 fallback。
- `src/store/video/slices/createVideo/action.ts` 守卫的自动切加 try/catch:异常时复位 `isCreating` 再上抛,确保发送按钮绝不卡住(防御)。

**验证**:`pnpm type-check` 0 error。待用户复测:硬刷新 → 点 sora-2 应切到、上方显示 sora-2、发送应能提交(不再卡住/不再报下架)。

**注**:回退用 seedance 默认视频 schema(aspectRatio/duration/resolution/prompt 等)。若 newapi 网关的 sora-2 不认这些参数(只认 openai sora-2 的 duration/size/prompt),生成可能在网关侧再报参数错——届时按 gpt-image-2 模式给 newapi/index.ts 的 `MODEL_PARAMETERS_OVERRIDES` 加 sora-2 的正确 video params。

**备份**:今日改动(generationConfig/action.ts + createVideo/action.ts + CHANGELOG)已同步到仓库外备份。

---

### 2026-07-16 · 视频修复三轮:grok 视频 404(路由)+ sora-2 503(网关侧)

用户复测:点 sora-2/发提示词不再卡住(二轮修复生效)。但两个模型报网关侧错:
- sora-2:`OpenAI-compatible video API error: 503 模型维护中` —— **网关侧**(sora-2 在用户 newapi 网关维护中),非代码。
- grok:`XAI video API error: 404 Invalid URL POST /v1/videos/generations`。

**grok 根因**:`grok-imagine-video` 在 model-bank xai.ts:306(type=video),被 newapi 的 xAI 子路由 `models` 收录 → 走 `createXAIVideo`(`${baseURL}/videos/generations`)→ 用户 newapi 网关无此端点(404)。而 sora-2 走 openai 子路由 `createOpenAICompatibleVideo`(`${baseURL}/videos`)→ 到网关(503 证明网关有此端点)。newapi 本质是 OpenAI-compatible 网关,video 应统一走 openai-compatible(`/videos`)。

**修复**:`packages/model-runtime/src/providers/newapi/index.ts` 的 anthropic/google/xai 三个原生子路由 `models` 过滤加 `&& m.type !== 'video'`,把 video 模型排除出原生子路由 → 落到 openai 子路由(默认)→ `createOpenAICompatibleVideo`(`/videos`),匹配网关。deepseek 用 helper 且无 video,不动。

**验证**:`pnpm type-check` 0 error(`m.type` 在 LOBE_DEFAULT_MODEL_LIST 项上有效);`npx vitest run src/providers/newapi/index.test.ts` 84 passed + 1 skip,未破坏。

**预期**:grok 视频现走 `/v1/videos`(网关有此端点),应不再 404;能否真正生成取决于网关是否支持 grok 视频。sora-2 的 503 是网关侧模型维护,需网关恢复或换模型,非代码。

**备份**:今日改动(newapi/index.ts + CHANGELOG)已同步到仓库外备份。

---

### 2026-07-16 · 视频修复四轮:veo 轮询 "fetch failed" 误标失败 + 延长等待

用户切 veo-3.1:报 `Background polling failed: fetch failed`,但上游视频其实已生成。视频生成异步耗时,用户建议延长等待。

**根因**:两处视频轮询(`apps/server/src/services/generation/videoBackgroundPolling.ts` pollUntilCompletion + `apps/server/src/routers/async/video.ts` pollUntilCompletion)的 catch 用 `error.message.includes('failed')` 判断是否终止——但 **"fetch failed"(瞬时网络错误)也含 'failed'** → 被当成致命错误抛出 → 任务标失败,即使上游视频已成功生成。配置:maxRetries=120、pollingInterval=5s(共 10 分钟)。

**修复**(两处并行):
1. catch 判断 `includes('failed')` → `startsWith('Video generation failed:')`——只对上游明确返回"Video generation failed:"才终止任务;瞬时 "fetch failed"/超时/连接重置改为**重试**,不再误标失败。
2. 延长等待:maxRetries 120→180、pollingInterval 5s→10s(共 **30 分钟**),适配 veo-3.1 等慢生成。

**验证**:`pnpm type-check` 0 error。

**未改**:poll fetch(createVideo.ts pollOpenAICompatibleVideoStatus)无超时(Node 默认),状态查询应快速返回,瞬时失败由 retry 兜底。若复测仍持续 fetch failed,再给单次 poll fetch 加 `AbortSignal.timeout(30s)` 快速失败 + 查网关 `/videos/{id}` 状态端点。

**备份**:今日改动(videoBackgroundPolling.ts + async/video.ts + CHANGELOG)已同步到仓库外备份。

---

### 2026-07-16 · 修复无法上传参考图(SSRF 拦截 localhost S3)

用户:视频生成 OK,但无法上传参考图。dev 日志查到根因:

**根因**:服务端 SSRF 防护(`packages/ssrf-safe-fetch` + `apps/server/src/services/generation/index.ts:60 fetchImageFromUrl`)拦截 `http://localhost:9000/lobe/...`(RustFS/S3 presigned URL),报 `DNS lookup ::1 (host:localhost) is not allowed. Because, It is private IP address.`。自托管场景 S3 在 localhost(私有 IP),服务端取回上传的参考图/视频缩略图时被 SSRF 拦 → 参考图上传后无法被服务端取回处理 → "无法上传参考图"(视频缩略图处理也受影响)。

**修复**:`.env.local` 追加 `SSRF_ALLOW_PRIVATE_IP_ADDRESS=1`(`packages/env/src/app.ts:117` 读 `process.env.SSRF_ALLOW_PRIVATE_IP_ADDRESS === '1'`),允许服务端取回 localhost 上的 S3 资源。重启 dev server 使 env 生效。

**说明**:这是自托管配置项(SSRF 默认禁私有 IP 是安全设计;S3 在 localhost 时需显式放行)。非代码 bug。

**验证**:dev server 已重启加载新 env;待用户复测参考图上传(应能取回处理)+ 视频缩略图。

**备份**:`.env.local` 含敏感信息未入仓库外备份(用户本地配置);改动一行 SSRF env 已记录于此。

---

### 2026-07-16 · 修复无法上传参考图(RustFS bucket 无 CORS)

用户:选图点上传,参考图不保存。dev 日志:`createS3PreSignedUrl 200`(presigned URL 拿到),但 RustFS 近期**无任何 PUT/OPTIONS 请求** → 浏览器 PUT 根本没发出(CORS preflight 失败)。上传 `xhr` 失败时 `status===0`(UPLOAD_NETWORK_ERROR)→ 不保存。

**根因**:RustFS `lobe` bucket **无 CORS 规则**(`bucket.config.json` 是 bucket policy 只允许 GetObject;`RUSTFS_CONSOLE_CORS_ALLOWED_ORIGINS=*` 是控制台 CORS 非 S3 API CORS)。浏览器从 localhost:3010 PUT 到 localhost:9000 跨域 → RustFS 无 CORS 响应头 → 浏览器拦截 PUT → 参考图上传失败(服务端写 S3 不经浏览器,故视频结果能存)。

**修复**:
1. 一次性脚本(已删)用 `@aws-sdk/client-s3` 给 `lobe` bucket 设 PutBucketCors:`AllowedOrigins=*` + GET/PUT/POST/HEAD/DELETE。复查确认设置成功(设置前"无 CORS"→设置后规则生效)。bucket CORS 存于 rustfs-data 卷,常规重启不丢。
2. `docker-compose/dev/docker-compose.yml` 的 rustfs-init 命令加 `mc cors set ...`(带 `|| true` 容错),让 `dev:docker`/reset 后自动重建 CORS(持久)。

**说明**:这是自托管 S3(RustFS)配置项——LobeChat 的 FileS3 不设 bucket CORS,需手动/自动配置。SSRF env(上一条)管"生成时服务端取回 S3 图";这条 CORS 管"浏览器上传到 S3"。两者都已修。

**验证**:bucket CORS 复查生效。待用户复测参考图上传(硬刷新 → 选图上传 → 应保存预览 + 能用于生成)。无需重启 dev(CORS 在 S3 侧)。

**备份**:docker-compose/dev/docker-compose.yml 已同步到仓库外备份。

---

### 2026-07-16 · 修复参考图未传入视频生成(createVideo 不读 imageUrls)

用户:参考图能保存了,但生成的视频没用参考图人物(疑似没传图)。确认:veo-3.1 经 newapi 走 `createOpenAICompatibleVideo`,而该函数(line 132)只解构 `prompt, imageUrl, size, duration` —— **只读 `imageUrl`(单图),不读 `imageUrls`(数组)/`endImageUrl`**。用户 veo-3.1 用 seedance 回退 schema,上传存的是 `imageUrls`(isSupportImageUrls=true, isSupportImageUrl=false)→ 参考图没传给网关 → 视频按纯文本生成。

**修复**:`packages/model-runtime/src/core/openaiCompatibleFactory/createVideo.ts` `createOpenAICompatibleVideo`:
- 解构加 `imageUrls, endImageUrl`。
- `input_reference` 用 `imageUrl || imageUrls?.[0]`(支持数组字段的首图)。
- `endImageUrl` → `last_frame`(末帧控制,部分 OpenAI-compatible 网关支持)。

**验证**:`pnpm type-check` 0 error(`RuntimeVideoGenParams` 含 imageUrls/endImageUrl);`npx vitest run createVideo.test.ts` 13 passed,无破坏。

**预期**:veo-3.1(+grok,同样经此路径)带参考图生成时,参考图作为 `input_reference` 传给网关,视频应基于参考图生成。若网关的 veo-3.1 不认 `input_reference`(用别的参数名如 `image`/`image_url`),届时按网关实际参数名再调。

**备份**:createVideo.ts 已同步到仓库外备份。

---

### 2026-07-16 · 参考图字段改为 images(string)(网关 veo 用 images 不用 input_reference)

用户:视频能生成(不再 400),但参考图仍未被使用。用户确认网关的图生视频参考图字段是 **`images`(string)**,不是 `input_reference`。

**修复**:`createVideo.ts` 对网关(非 api.openai.com)下发 `images: referenceImage`(string)+ 保留 `input_reference`(string)兼容不同模型;真 OpenAI(api.openai.com)仍用 `input_reference`({image_url} 对象)。即:网关同时发 images + input_reference(均 string),veo 用 images。

**验证**:`pnpm type-check` 0 error;`createVideo.test.ts` 13 passed。

**备份**:createVideo.ts 已同步到仓库外备份。

---

### 2026-07-16 · 修复参考图视频 400(网关 input_reference 要 string,非对象)

用户:参考图视频报 `400 invalid_json: cannot unmarshal object into Go struct field .Alias.input_reference of type string`。

**根因**:veo-3.1 经 newapi 的 openai 子路由(用 openai runtime,`options.provider='openai'`)→ `createOpenAICompatibleVideo` 的 `input_reference` 条件 `provider === ModelProvider.OpenAI` 命中 → 发了对象 `{image_url}`。但用户的 newapi 网关(Go 实现)的 `input_reference` 是 **string 类型**,传对象 → 400。真·OpenAI(api.openai.com)才需对象(拒裸字符串),网关要 string。但两者 `provider` 都是 'openai',无法用 provider 区分。

**修复**:`createVideo.ts` 改用 **baseURL 区分**:`isRealOpenAIVideoAPI = options.baseURL?.includes('api.openai.com')`。真 OpenAI(api.openai.com)→ `{image_url}` 对象;网关(用户 gateway,非 api.openai.com)→ **string**。`input_reference` + `last_frame` 均如此。移除未用的 `ModelProvider` import。

**验证**:`pnpm type-check` 0 error;`createVideo.test.ts` 13 passed(测试 baseURL=api.openai.com→对象,断言不破)。

**预期**:veo-3.1 带参考图 → `input_reference`(string)传给网关 → 网关接受(不再 400)+ 应用于图生视频。若网关的 veo 不用 `input_reference` 做图生视频(用别的字段如 `images`),再按网关实际字段调。

**备份**:createVideo.ts 已同步到仓库外备份。

---

### 2026-07-16 · 参考图字段改为 images(string)(网关 veo 用 images 不用 input_reference)

用户:视频能生成(不再 400),但参考图仍未被使用。用户确认网关的图生视频参考图字段是 **`images`(string)**,不是 `input_reference`。

**修复**:`createVideo.ts` 对网关(非 api.openai.com)下发 `images: referenceImage`(string)+ 保留 `input_reference`(string)兼容不同模型;真 OpenAI(api.openai.com)仍用 `input_reference`({image_url} 对象)。即:网关同时发 images + input_reference(均 string),veo 用 images。

**验证**:`pnpm type-check` 0 error;`createVideo.test.ts` 13 passed。

**备份**:createVideo.ts 已同步到仓库外备份。


---

### 2026-07-16 · images 改为 []string 数组(网关 images 是 []string)

用户:`400 cannot unmarshal string into .Alias.images of type []string` —— 网关 images 是 **[]string 数组**,非单 string。

**修复**:`createVideo.ts` 网关分支 `images` 发数组 `imagesArray = [imageUrl, ...imageUrls].filter(Boolean)`;input_reference(string)兼容保留;真 OpenAI 仍 input_reference 对象。

**验证**:`pnpm type-check` 0 error;`createVideo.test.ts` 13 passed。

---

### 2026-07-16 · 参考图改 base64 内联(适配桌面端本地数据+远程云API)

用户架构:打包桌面端 + 远程调用 api.liuma.ai 云端 + 数据存本地。参考图在本地(localhost S3),远程网关无法 http 下载 → "远程图片下载失败"。选 B(base64 内联)非 A(公网S3,桌面端不现实)。

**修复**:`createVideo.ts` 网关分支(非 api.openai.com)用 `fetchImageAsDataUrl` 在服务端取回参考图(localhost S3,SSRF 已放行)转 **base64 data URL** 内联发送 `images: [data:image/...;base64,...]`,网关无需下载。真 OpenAI(api.openai.com)仍用 input_reference({image_url} 对象)。新增 helper `fetchImageAsDataUrl`。

**测试**:`createVideo.test.ts` 更新"非OpenAI provider"用例:mock 两次 fetch(图片取回+视频POST),断言 `images` 为 base64 data URL 数组、`input_reference` 不发。

**验证**:`pnpm type-check` 0 error;`createVideo.test.ts` 13 passed。

**前提**:api.liuma.ai 的 `images` 需接受 `data:image/...;base64,...`(newapi/veo 通常支持)。若不支持,需网关侧支持 base64 或换方案。
**备份**:createVideo.ts + createVideo.test.ts 已同步到仓库外备份。
