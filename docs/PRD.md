# ai-i18n 现行产品决策

> 本文记录已确认的跨模块行为与原因。公开接入方式以 `apps/docs` 为准，MCP 契约以 `packages/mcp/README.md` 和工具 schema 为准。

## 平台与范围

- ai-i18n 面向 Vite 8 浏览器项目，支持 Vanilla、Vue 3、React 18+。最低 Node.js 版本是 22.13.0：Vite 8 起点为 22.12.0，但本项目使用 22.13.0 起无需启动参数的内置 `node:sqlite`。Node 22 中 SQLite 模块仍是实验性接口，发布前须在最低版本上验证。
- 发布包为 Core、Analyzer、Vite、ESLint、MCP；移除专用 OpenAI 翻译包和 SQLite 翻译结果包。版本独立按 SemVer 演进，内部依赖使用精确版本；发布流程见[发布与 CI](release.md)。
- 每个 Vite build 处理其入口可达的本地 ESM 源码，包括 Vite root 外的 workspace 源码；`node_modules` 预构建依赖、CommonJS、SSR 不在提取范围。框架插件按最终模式按需启用。
- 只提取显式 `t()`、tagged template、Vue `tRef()`/`tComputed()`、受支持的静态文案树及 HTML 显式表达式。不会猜测普通文本、JSXText 或业务属性。解析器采用 Yuku，不暴露解析器选择配置。
- 数据库、接口和业务判断保存稳定语义 code；在展示层把有限业务枚举映射为文案，不把译文用作持久业务身份。

## 文案身份与运行时

- `t('文案')` 默认全局共享。第二参数是选项对象；可选静态 `comment` 只区分翻译身份，可选 `scope: 'file'` 显式指定文件范围。全局 `文案#comment` 是独立 key，`#` 和反斜杠进行转义，避免碰撞。comment 不改变原文、运行时参数或范围。
- 全局有 comment 的文案只查同 comment 的全局译文，缺译显示原文；不借用无 comment 译文。文件范围先查当前文件的同一文案身份，再查对应全局身份，最后显示原文。文件有 comment 时同样不得借用无 comment 译文。
- 对可查身份，人工译文优先于适配器结果；同一来源内文件优先于全局。空字符串有效，`null` 与缺项为缺译。模板占位符必须一致。
- 文件资源 key 由短文件标识和文案身份组成，不包含完整路径；标识与路径的映射保存在本地提取索引和生成的 manifest。目标语言始终按 locale 分包，`loading` 仅配置资源提示；文件资源按应用异步模块边界合并成按需包，减少首屏资源与零碎请求。
- 浏览器 Runtime 维护应用级语言状态。Vue 顶层 `t()` 在响应式执行路径建立依赖，React 组件通过 `useI18n()` 订阅。异步语言切换遵守最后一次请求优先；缺失译文回退原文。
- `defineI18nMessages()` 是编译期静态集合宏；参数对象或数组保留为运行时值。Vue `tRef()` 和 `tComputed()` 生成随语言 revision 更新的同形计算值。Vitest 使用独立的内存 Runtime，不读取项目翻译文件。

## 存储与执行时机

- SQLite 只保存当前仓库工作树的可重建提取索引，不提交 Git，也不保存译文。默认位置是仓库根 `node_modules/.cache/ai-i18n/extracted.sqlite`；多个应用按 Vite root 分区，没有 Git 根时使用应用 root。完整扫描成功才替换活动索引，失败不能暴露半成品。
- Build 与显式 MCP `ai_i18n_scan_project` 完整扫描入口、调用可选适配器并生成资源。Dev 只转换运行时调用、加载已有资源；不做完整提取、翻译服务调用或翻译存储写入。新增且缺译的文案在 Dev 显示原文。
- 持久人工输入为 `i18n/locales/<locale>.manual.json`（全局）和 `i18n/locales/files/<locale>.manual.json`（文件）；都是 key→string JSON。生成的 `i18n/locales/<locale>.json` 与 `i18n/locales/files/<locale>/<group>.json` 是最终 key→value 资源，可按应用 DX 提交 Git，但不作为下次构建输入。
- 不再使用项目 `extracted/`、`translations/` 分片或 `overrides/`。旧人工覆盖仅在可无损映射时迁入 manual；文件规则须先显式标注 `scope: 'file'`，出现位置规则须完整覆盖新身份。冲突或歧义必须报错并保留旧文件。旧自动译文不会自动升格成人工输入。
- 可选异步 `adapter(catalog)` 收到完整活动文案目录，返回按 locale/key 索引的本次结果，或返回 `null` 表示不处理。缺项和 `null` 表示缺译；不沿用上次结果。适配器可自行访问翻译服务或线上资源，也自行决定外部持久化和服务端 key 映射。插件验证未知 key/locale、值类型与占位符，不把结果写入 manual。
- 服务端内容如需影响应用译文，须在 Build/扫描时通过适配器返回并重新部署。浏览器运行中不自动拉取线上译文或覆盖本地资源；不负责与后端传统 key 系统统一。
- `failOnMissingTranslations` 仅在 Build 检查最终活动译文。空字符串有效；缺译在 Dev、扫描和 Runtime 仍可回退原文。

## Review、MCP 与 Agent

- Review 是独立的可选 Dev 插件；可注册页面内入口和同源独立工作台。当前页可利用已转换模块；全量视图显式扫描入口。它编辑 manual 输入，保存后须重新扫描或 Build 才能更新最终资源。没有出现位置级译文规则。
- MCP 先发现配置，再解析选中应用，显式扫描，分页列出文案，按返回 key 写入或清除人工译文。写入只改 manual，返回需要重建；不修改 SQLite 提取数据或生成的 locales。未知 key、语言和占位符错误拒绝整个批次。文件 key 必须从工具返回值复制。
- `.agents/skills/integrate-ai-i18n` 面向 Agent 接入应用，`.agents/skills/use-ai-i18n-mcp` 面向 Agent 扫描与译文操作；两者与 `apps/docs` 同步产品事实，但分别说明操作边界与用户用法。对外 Skill 的主文件保持短小，详细契约放一层 `references/*.md`。
- 用户文档站按 `/guide`、`/ai`、`/api` 组织，并发布 `llms.txt` 精简索引。公开 TypeScript API 参考手写维护；以源码类型与实际行为校准。

## 示例与配置

- 配置文件发现和 Vite 配置加载边界见[配置决策](prd/configuration.md)。
- 示例视觉与静态部署边界见[演示示例](prd/examples.md)。
- Agent 插件与清单新鲜度见[Agent 插件](prd/agent-plugin.md)。
