# Phase 2 TODO

> 对应文档：[Phase 2 PRD](./PRD.md)
>
> 本阶段只实现 Build Watch、Locale Lazy 和 Cache 容量控制，不包含性能优化项目。

## 0. 实施优先级与 P0

- [x] 锁定 Phase 1 默认协议、Runtime 和文件格式为兼容基线。
- [x] 完成 Vite 8 Build Watch 生命周期与当前模块图 Spike。
- [x] 完成 locale virtual module、内容 hash、base 与 HTML 资源提示 Spike。
- [x] 明确 import 移除后的活动模块校准规则。
- [x] 明确不同 locale 并发切换采用最后调用获胜。
- [x] 明确 Locale Lazy HTML 首屏使用 source fallback。
- [x] 明确受保护 cache 内容自身超限时保留并 warning。
- [x] 将 Phase 2 PRD 状态推进为 Ready。

## 1. 已确认约束

- [x] 不建立性能 benchmark、性能预算或 profiler 基础设施。
- [x] 不实现 cache 分片。
- [x] 不实现 module group × locale 二维拆分。
- [x] 不增加 ProviderCoordinator 通用重试层。
- [x] `@ai-i18n/openai` 继续使用可配置 `maxRetries`，默认值为 `3`。
- [x] Vite Full Bundle Mode 只观察，不阻塞 Phase 2。
- [x] Native 插件等待 Vite 或 Rolldown 提供稳定支持。
- [x] Phase 1 默认模式和文件协议必须保持兼容。

## 2. Build Watch

- [x] 区分普通 Build 与 `vite build --watch` 生命周期。
- [x] 普通 Build 继续使用新鲜 ProjectState。
- [x] Build Watch 首轮创建状态，后续重建不执行全量 reset。
- [x] Watch 重建复用 analyzer、resolution 和 reverse dependents。
- [x] source 变化只刷新当前模块和必要 dependents。
- [x] 静态依赖变化只刷新受影响的依赖方。
- [x] extracted 翻译变化不重新 parse source。
- [x] locale 变化只更新对应翻译和 registration。
- [x] source 删除后移除活动 file/module references。
- [x] source 重命名不重复请求已有 Translation Memory。
- [x] import 移除后校准当前入口可达的活动模块。
- [x] extractor、schema 或提取配置变化通过重启重建分析状态。
- [x] Vite 配置变化需要重启 Watch，并提供明确文档。
- [x] 已有翻译在 Watch 重建中不重复请求 Provider。
- [x] 内容未变化时不重写 cache、extracted 或 locale 文件。
- [x] registration 未变化时生成内容保持稳定。

### 2.1 Build Watch 测试

- [x] 添加真实 `vite build --watch` 首轮和二次构建测试。
- [x] 覆盖直接 source 变化。
- [x] 覆盖跨文件静态依赖变化。
- [x] 覆盖 extracted 翻译变化。
- [x] 覆盖 locale 翻译变化。
- [x] 覆盖 source 删除和重命名。
- [x] 覆盖 import 移除后的活动模块校准。
- [x] 覆盖已有翻译不重复请求。
- [x] 覆盖无内容变化时不重写文件。
- [x] 测试只验证行为，不记录构建耗时。

P0/P1 验收证据见 [Phase 2 验收记录](./ACCEPTANCE.md)。

## 3. Locale Lazy

### 3.1 配置与类型

- [x] 增加 `loading.strategy = 'locale'`。
- [x] 增加 `loading.preload` locale 列表。
- [x] 增加 `loading.prefetch` locale 列表。
- [x] 校验 locale 必须存在于配置。
- [x] 禁止 source locale 出现在资源提示列表中。
- [x] 禁止同一 locale 同时出现在 preload 和 prefetch 中。
- [x] 对同一列表中的重复 locale 去重。
- [x] `defaultLang` 不是 source locale 时自动使用 preload 语义。
- [x] 未配置 `loading` 时保持 Phase 1 行为。

### 3.2 语言资产与 Manifest

- [x] 为每个目标 locale 生成独立 Vite 语言模块。
- [x] 生成静态可分析的 locale 动态 import 映射。
- [x] 生成 Dev 和 Build 共用语义的 locale manifest。
- [x] 保证生产资产遵守 Vite `base`。
- [x] 保证生产资产使用内容 hash。
- [x] 保证 source fallback 同步可用。
- [x] 保证单个语言资产只包含该 locale 的活动 messages。
- [x] 保持现有 cache、extracted 和 locale 持久化 schema。

### 3.3 资源提示

- [x] 为非 source 的 `defaultLang` 和 preload locales 生成 `modulepreload`。
- [x] 为 prefetch locales 生成 `prefetch`。
- [x] 完全 lazy 的 locale 不生成 `<link>`。
- [x] 资源提示引用最终的 base/hash URL。
- [x] 不把 prefetch 完成作为语言切换的前置条件。
- [x] Dev 和 Build 的资源提示语义一致。

### 3.4 Runtime

- [x] `setLang(sourceLang)` 不发起网络请求。
- [x] 已加载 locale 可以直接切换。
- [x] 未加载 locale 等待动态 import 完成后再切换。
- [x] 相同 locale 并发加载共享一个 Promise。
- [x] 加载失败时保持当前语言并返回可处理错误。
- [x] 非 source 的 `defaultLang` 在初始化后自动开始加载。
- [x] 默认语言加载前使用 source fallback。
- [x] 加载完成后通知 Runtime 订阅者。
- [x] `null` 翻译继续稳定回退 source。

### 3.5 HMR 与框架测试

- [x] source message 变化只更新受影响语言资产。
- [x] extracted 翻译变化只更新对应 locale。
- [x] 已加载 locale 通过 HMR 替换数据。
- [x] 未加载 locale 不因 HMR 被提前请求。
- [x] HMR 不重复注册 module 或累计旧翻译。
- [x] 添加 Vanilla Dev/Build/切换测试。
- [x] 添加 Vue Dev/Build/切换测试。
- [x] 添加 React Dev/Build/切换测试。
- [x] 添加 HTML Dev/Build/切换测试。
- [x] 添加 base path、加载失败和并发去重测试。

## 4. Cache 容量控制

### 4.1 配置

- [x] 增加 `cache.maxMessages`。
- [x] 增加 `cache.maxBytes`。
- [x] 两项都省略时不启用容量清理。
- [x] 两项必须是正整数。
- [x] 任一限制超出时启动清理。
- [x] 同时配置时要求输出同时满足两个限制。

### 4.2 活跃判定与淘汰

- [x] 根据 cache file records 和 ProjectState 计算活动 message IDs。
- [x] 完成磁盘合并和 missing source 清理后再计算容量。
- [x] 活动 messages 永不参与容量淘汰。
- [x] 只淘汰没有活动引用的 Translation Memory。
- [x] 淘汰候选按 message ID 稳定排序。
- [x] 删除到同时满足条数和体积限制。
- [x] `maxBytes` 使用稳定序列化后的 UTF-8 字节数。
- [x] 活动数据自身超限时保留数据并 warning。
- [x] 不写入时间戳、运行次数、访问次数或 LRU metadata。
- [x] 使用现有原子写入流程保存清理结果。
- [x] 不创建 cache 分片或 index 文件。

### 4.3 与现有 Cleanup 的关系

- [x] `cleanup.orphanMessages: false` 时只在超限后删除非活跃记录。
- [x] `cleanup.orphanMessages: true` 时继续删除全部非活跃记录。
- [x] `cleanup.orphanMessages: true` 的优先级高于容量限制。
- [x] `cleanup.missingSourceFiles` 继续控制缺失 source 的活动引用清理。

### 4.4 Cache 测试

- [x] 覆盖默认永久保留历史 Translation Memory。
- [x] 覆盖只配置 `maxMessages`。
- [x] 覆盖只配置 `maxBytes`。
- [x] 覆盖同时配置两个限制。
- [x] 覆盖活动和非活跃 messages 混合场景。
- [x] 覆盖活动数据自身超过限制。
- [x] 覆盖 Agent 编辑和 Git 合并后的容量清理。
- [x] 覆盖清理结果稳定且不丢活动翻译。

## 5. 文档与兼容

- [x] 更新根 README 的 Phase 2 配置示例。
- [x] 更新 `@ai-i18n/vite` README 的 `loading` 配置。
- [x] 更新 `@ai-i18n/vite` README 的 `cache` 配置。
- [x] 更新 `apps/docs` 用户文档中的 Locale Lazy 配置与行为说明。
- [x] 说明 preload、prefetch 和完全 lazy 的区别。
- [x] 说明 prefetch 是浏览器提示，不保证完成时间。
- [x] 说明 Build Watch 遇到 Vite 配置变化时需要重启。
- [x] 说明容量限制只淘汰非活跃 Translation Memory。
- [x] 说明活动数据超限时会 warning 并保留。
- [x] 检查并同步 `.agents/skills/integrate-ai-i18n`。
- [x] 检查并同步 `.agents/skills/use-ai-i18n-mcp`。
- [x] Phase 1 示例无需修改即可继续使用。

## 6. 质量检查

- [x] 重要模块添加中文注释。
- [x] 测试文件放在对应 package 的 `test` 目录。
- [x] 检查修改后的源文件是否需要拆分，尽量不超过 400 行。
- [x] 运行 `pnpm check`。
- [x] 运行 `pnpm test`。
- [x] 运行 `pnpm build`。
- [x] 确认未新增性能 benchmark。
- [x] 确认未引入 cache 分片、SSR、全目录扫描或额外 CLI。

## 7. Phase 2 完成定义

- [x] Build Watch 在后续重建中复用 ProjectState。
- [x] Build Watch 的变化、删除、重命名和 Translation Memory 行为通过测试。
- [x] Locale Lazy 只加载当前或被提示加载的目标语言。
- [x] preload、prefetch 和完全 lazy 行为通过 Dev/Build 测试。
- [x] Locale 加载并发去重，失败时不进入半切换状态。
- [x] Cache 可以按 message 数量或字节数限制历史规模。
- [x] Cache 容量清理不删除活动翻译。
- [x] Phase 1 默认协议、Runtime、配置和项目无需迁移。
- [x] Vite Full Bundle Mode 和 native 插件仍为非阻塞观察项。
- [x] 所有质量检查通过。
