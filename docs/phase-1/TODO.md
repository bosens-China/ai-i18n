# Phase 1 TODO

> 对应文档：[Phase 1 PRD](./PRD.md)
>
> 只通过 `vite dev`、`vite build` 驱动产品流程，不新增 scan/sync CLI。

## 0. 已确认约束

- [x] Vite 8 only。
- [x] pnpm monorepo。
- [x] Dev 渐进提取，Build 完整处理入口可达模块图。
- [x] Dev/Build 都写 `cache.json`、`extracted/**`、`locales/**`。
- [x] cache 提交 Git并保留 Translation Memory。
- [x] locales 按语言拆分并由插件生成。
- [x] 只提取显式 `t()`。
- [x] message ID 为 source + optional comment，不包含路径。
- [x] 缺失翻译为 `null`，Runtime 回退源语言。
- [x] Provider 在 Dev/Build 自动运行；Dev 防抖、批处理、非阻塞。
- [x] 模块级注册携带全部配置语言。
- [x] Vue、React、HTML 使用可组合 `extractors`。
- [x] 优先验证 Yuku，不自研 Rust parser。
- [x] SSR 不支持。

## 1. Workspace

- [x] 创建 `pnpm-workspace.yaml`。
- [x] 重构根 `package.json` workspace scripts。
- [x] 建立共享 TypeScript、ESLint、Vitest 配置。
- [x] 生成并提交 `pnpm-lock.yaml`。
- [x] 创建 `packages/core`、`packages/vite`、`packages/vue`、`packages/react`、`packages/openai`。
- [x] 创建 `packages/eslint`，迁移并发布现有 AI 静态检查。
- [x] 创建 Vanilla、Vue、React、Mixed examples workspace 节点。
- [x] 配置 ESM、类型声明、exports、files、engines、publishConfig。
- [ ] 添加 License、README、repository metadata。
- [x] 建立 changeset 或等价发布流程。

## 2. Schema 与 Core

- [x] 定义 `LangOption { value, label }`。
- [x] 定义 `TranslationValue = string | null`。
- [x] 定义 cache v1 schema。
- [x] 定义 extracted v1 schema。
- [x] 定义 locale v1 schema。
- [x] 为所有 schema 添加运行时校验和明确版本错误。
- [x] 保留并测试现有 source/context key 转义语义。
- [x] 将 context 对外命名统一为 comment，并提供必要迁移兼容。
- [x] 规范 comment 首尾空白与空值行为。
- [x] 实现相同 message ID 的全局 Translation Memory。
- [x] 实现非空翻译冲突检测，禁止 last-write-wins。
- [x] 实现 `null -> source` 的确定性 fallback。
- [x] 实现 `t`、`setLang`、`getLang`、`getLangs`、`subscribe`。
- [x] 实现 module register/replace/unregister 和引用计数。
- [x] 移除能源业务默认值和具体 Provider 默认模型。

## 3. Yuku 准入 Spike

- [x] 安装并锁定 `yuku-analyzer` 候选版本。
- [x] 实现内部 `analyzeModule` / `extractMessages` 窄边界。
- [x] 将现有 Babel fixtures 同时跑 Babel 与 Yuku，对比提取结果。
- [x] 覆盖 JS、TS、JSX、TSX、decorators、template literal。
- [x] 覆盖 import alias、re-export、dynamic import、跨文件静态常量。
- [x] 验证自定义 resolver 与 Vite `this.resolve` 的映射方案。
- [x] 验证 Analyzer add/replace/remove file。
- [ ] 验证 macOS、Linux、Windows x64/arm64 安装。
- [x] 建立 Babel/Yuku cold parse、warm update、Build benchmark。
- [x] 记录准入结论：采用 Yuku，或以可复现失败证据回退 Babel。
- [x] 不将 parser 选择暴露为公共配置。

## 4. Vite 8 主插件

- [x] 创建 `@ai-i18n/vite` 插件入口。
- [x] 在 `configResolved` 后基于 Vite root 归一化路径。
- [x] 使用 hook filters 限定默认 JS/TS。
- [x] 识别来自约定虚拟模块的 `t` binding 和 alias。
- [x] 拒绝其他来源的同名 `t()`。
- [x] 对动态参数输出带文件位置的 warning。
- [x] 使用 `this.resolve` 解析 alias 和跨文件 import。
- [x] 使用 `this.addWatchFile` 登记额外静态依赖。
- [x] 建立 Dev 累计 ProjectState。
- [x] 建立 Build 新鲜 ProjectState 和完整可达 seen set。
- [x] 处理源码 create/update/delete/rename。
- [x] 只根据源码真实不存在执行 missingSourceFiles cleanup。
- [x] 不因 Build 未访问而删除仍存在文件。
- [x] 使用 Vite 8 environment-aware `hotUpdate`。
- [x] 明确跳过 SSR Runtime 并输出可理解诊断。
- [x] 不依赖 Vite 私有 module graph 和缓存格式。

## 5. 模块级注册

- [x] 为包含有效 `t()` 的模块注入 side-effect virtual import。
- [x] 生成稳定且 URL-safe 的 virtual register module ID。
- [x] registration payload 包含该模块全部配置语言。
- [x] Runtime 按 message ID 去重、按 module ID 维护引用。
- [x] HMR replace 不重复累计旧 messages。
- [x] HMR dispose 正确释放 module references。
- [x] 动态 import 模块在执行业务代码前完成注册。
- [x] 保留 shebang 和 directive prologue。
- [x] 生成正确 sourcemap。
- [x] 没有 `t()` 的模块不产生代码变化。
- [x] 验证相同 ID 跨模块只保留一份活动翻译语义。

## 5.1 ESLint 静态检查迁移

- [x] 创建可发布的 `@ai-i18n/eslint-plugin` package 入口和 metadata。
- [x] 将旧版 `t-static-args` 迁入 `packages/eslint`，移除根私有包导出。
- [x] 对齐 Vite/Yuku 的 `t()` binding、alias、跨文件常量和动态参数语义。
- [x] 提供 ESLint flat config 使用方式，但不默认侵入宿主规则集。
- [x] 将规则测试迁入 `packages/eslint/test` 并接入 workspace scripts。

## 6. Provider Coordinator

- [x] 定义框架无关 `Translator` 接口。
- [x] 使用 `messageId + locale` 作为请求去重 key。
- [x] 实现进程内 in-flight Promise 去重。
- [x] 实现可配置 `debounceMs`，默认 100ms。
- [x] 实现可配置 `batchLength`，默认按序列化请求字符长度 `12_000` 成批。
- [x] batch length 达标时立即 flush，单条超限请求独立成批。
- [x] 实现可配置 `maxConcurrency`，默认最多并发 5 个 Provider 批次。
- [x] Provider 只接收 `null` 项。
- [x] Dev transform 不等待 Provider 网络请求。
- [x] Dev 翻译完成后更新 cache、重复 extracted、locales。
- [x] Dev 翻译完成后只 HMR 受影响注册模块。
- [x] Build 在结束前等待必要批次完成。
- [x] 校验 Provider 返回 ID、locale、string/null 类型。
- [x] Provider 失败保持 null，默认 warning。
- [x] 实现严格模式，将 Provider/missing warning 升级为 Build error。
- [x] 保证日志和落盘不包含 API key、完整 Prompt、原始响应。

## 7. 文件协议与写入

- [x] 默认创建 `i18n/cache.json`。
- [x] 按源码相对路径创建 `i18n/extracted/**/<file>.json`。
- [x] 为每个 locale 创建 `i18n/locales/<locale>.json`。
- [x] cache 保存 file fingerprints、message references 和 Translation Memory。
- [x] extracted 保存 source/comment/location/translations，不保存完整 AST。
- [x] locale 保存 label/value 和活动 messages。
- [x] 源语言 locale 永远输出 source。
- [x] 目标语言缺失项输出 `null`，不输出空字符串。
- [x] Agent 编辑 extracted 后合并回 cache。
- [x] cache 命中时自动补充新 extracted 文件。
- [x] 相同 ID 的活动 extracted 文件自动同步。
- [x] 相同 ID 的不同非空翻译产生冲突错误和文件列表。
- [x] 配置新增 locale 时，为 extracted/cache 补 null。
- [x] 配置移除 locale 时，cache 默认保留历史值以便未来恢复。
- [x] 所有 JSON 稳定排序并使用统一格式。
- [x] 使用临时文件 + rename 原子写入。
- [x] 使用单进程串行 writer queue。
- [x] 写入前读取最新磁盘版本，避免覆盖 Agent 变更。
- [x] 忽略插件自身文件事件，防止 watcher 循环。
- [x] 最后写 cache，异常中断后可重新校准。
- [x] `cleanup.missingSourceFiles` 默认 true。
- [x] `cleanup.orphanMessages` 默认 false。
- [x] 验证 cache 可直接提交且不包含绝对路径/时间戳/secret。

## 8. HTML Extractor

- [x] 从 `@ai-i18n/vite` 导出 `html()`。
- [x] 使用可靠 HTML parser，不用全局正则改写 DOM。
- [x] 只识别完整文本节点 `t('source', 'comment?')`。
- [x] 只识别完整可翻译属性值 `t('source', 'comment?')`。
- [x] 明确一期允许的属性白名单。
- [x] 不识别普通 title、文本、属性和混合字符串片段。
- [x] 不重复处理 inline module script。
- [x] 使用 `transformIndexHtml` 改写 Dev 响应和 Build 输出。
- [x] 不改写磁盘上的 HTML 源文件。
- [x] 替换初始文本时正确执行 HTML escaping。
- [x] 注入内部 message markers。
- [x] 注入最小 client bridge，并注册 HTML module 全部语言。
- [x] `setLang()` 更新 marker 文本和属性。
- [x] HTML 生成对应 extracted 文件并接入 cache/Provider/locales。
- [x] HTML Provider 完成后在 Dev 正确更新或 reload。
- [x] 添加单入口、多入口、属性、转义和错误表达式测试。

## 9. Vue Extractor 与 Runtime

- [x] 创建 `@ai-i18n/vue/vite` extractor 入口。
- [x] 创建 `@ai-i18n/vue` client 入口。
- [x] 使用 `@vue/compiler-sfc` 拆分 SFC。
- [x] script/script setup 复用 Yuku JS pipeline。
- [x] 使用 `@vue/compiler-dom` 遍历模板表达式。
- [x] 模板中只提取显式 `t()`。
- [x] 不提取普通 Vue Text 和普通属性文本。
- [x] `.vue` extracted 路径映射回原始 SFC。
- [x] 调整 script/template 表达式源码位置。
- [x] 实现 Vue ref/computed Runtime binding。
- [x] 验证基础 Vite package 不 import Vue/compiler。
- [x] 配置 Vue/compiler peer dependency。
- [x] 验证与 `@vitejs/plugin-vue` 插件顺序。

## 10. React Extractor 与 Runtime

- [x] 创建 `@ai-i18n/react/vite` extractor 入口。
- [x] 创建 `@ai-i18n/react` client 入口。
- [x] React extractor 扩展 `.jsx`/`.tsx` filter。
- [x] 复用同一次 Yuku AST/semantic 结果，不重复 parse。
- [x] 只提取显式 `t()`，不提取 JSXText 或普通 props。
- [x] 实现基于 `useSyncExternalStore` 的 `useI18n()`。
- [x] 配置 React peer dependency。
- [x] 验证基础 Vite package 不 import React。
- [x] 添加 React render、setLang、null fallback、HMR 测试。

## 11. Extractor 组合

- [x] 定义最小 Extractor contract，只允许识别/提取/映射源码。
- [x] Base 统一负责文件、Provider、Runtime 和 HMR。
- [x] 支持 `extractors: [react(), vue(), html()]`。
- [x] 相同物理文件避免被多个 extractor 重复提取。
- [x] Vue/React mixed example 共享同一 Runtime 和 cache。
- [x] client entry 与 `/vite` entry 保持依赖隔离。

## 12. OpenAI-compatible Provider

- [x] 创建可选 `@ai-i18n/openai` package。
- [x] 使用 LangChain `ChatOpenAI`，不让 Core/Vite 依赖 LangChain 或 OpenAI SDK。
- [x] 支持 base URL、model、headers、可选 API key 和本地 OpenAI-compatible 服务。
- [x] temperature 默认 1、超时默认 120 秒、重试默认 3，并支持可选 max tokens。
- [x] 使用内部 JSON Schema 结构化输出并严格校验批次结果。
- [x] 提供可覆盖的默认系统 Prompt，并固定追加纯 JSON 尾注和最小示例。
- [x] 仅在显式注入配置时启用 LangSmith tracing。
- [x] 添加 mock server 测试，不在 CI 请求真实服务。

## 13. 集成测试

- [x] Dev 首次访问只生成已请求模块文件。
- [x] Dev 动态路由访问后渐进新增提取结果。
- [x] Build 覆盖入口可达静态/动态模块。
- [x] Dev 首屏不被 Provider 阻塞。
- [x] Dev 防抖、batch length 和并发上限行为可测。
- [x] Build 等待 Provider 并把结果写入当前注册数据/locales。
- [x] 文件移动复用相同 message ID cache。
- [x] 文件删除清理 extracted 但默认保留 Translation Memory。
- [x] `null` 从任意切换历史稳定回退源语言。
- [x] 全部语言随模块注册，不发起 locale 网络请求。
- [x] Vanilla、Vue、React、Mixed 均通过 dev/build。
- [x] 明确验证 SSR 不受支持且不会共享全局状态。
- [x] 测试 Windows 路径和 monorepo 非 cwd root。

## 14. 发布与质量

- [x] `pnpm lint`。
- [x] `pnpm check`。
- [x] `pnpm test`。
- [x] `pnpm build`。
- [x] `pnpm pack` 检查所有 package 内容。
- [x] README 记录目录协议、Git 提交策略和 Agent 工作流。
- [x] README 记录 Dev 渐进/Build 完整语义。
- [x] README 明确只支持显式 `t()`、浏览器 Runtime 和 Vite 8。
- [ ] 发布 `1.0.0-alpha` 给真实项目验证。

## 15. Phase 1 完成定义

- [ ] PRD 验收标准全部通过。
- [ ] Yuku 准入结论有 fixtures、平台验证和 benchmark 支撑。
- [x] 不存在 `src/pages`、路由目录或业务默认值。
- [x] 不存在独立 sync/scan CLI。
- [x] cache/extracted/locales 在 Dev、Build、Agent 编辑和 Git 合并场景下不丢翻译。
- [x] React/Vue extractors 可同时启用且只解析一次公共 JS AST。
- [x] HTML 构建初始文本和运行时切换都正确。
- [x] 发布包没有跨层依赖泄漏。
