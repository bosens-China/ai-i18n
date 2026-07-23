# Phase 2 TODO

> 对应文档：[Phase 2 PRD](./PRD.md)
>
> 本阶段只实现 Build Watch、Locale Lazy 和 Cache 容量控制，不包含性能优化项目。

## 1. 已确认约束

- [x] 不建立性能 benchmark、性能预算或 profiler 基础设施。
- [x] 不实现 cache 分片。
- [x] 不实现 module group × locale 二维拆分。
- [x] 不增加 ProviderCoordinator 通用重试层。
- [x] `@boses/openai` 继续使用可配置 `maxRetries`，默认值为 `3`。
- [x] Vite Full Bundle Mode 只观察，不阻塞 Phase 2。
- [x] Native 插件等待 Vite 或 Rolldown 提供稳定支持。
- [x] Phase 1 默认模式和文件协议必须保持兼容。

## 2. Build Watch

- [ ] 区分普通 Build 与 `vite build --watch` 生命周期。
- [ ] 普通 Build 继续使用新鲜 ProjectState。
- [ ] Build Watch 首轮创建状态，后续重建不执行全量 reset。
- [ ] Watch 重建复用 analyzer、resolution 和 reverse dependents。
- [ ] source 变化只刷新当前模块和必要 dependents。
- [ ] 静态依赖变化只刷新受影响的依赖方。
- [ ] extracted 翻译变化不重新 parse source。
- [ ] locale 变化只更新对应翻译和 registration。
- [ ] source 删除后移除活动 file/module references。
- [ ] source 重命名不重复请求已有 Translation Memory。
- [ ] extractor、schema 或提取配置变化只重建分析状态。
- [ ] Vite 配置变化需要重启 Watch，并提供明确文档。
- [ ] 已有翻译在 Watch 重建中不重复请求 Provider。
- [ ] 内容未变化时不重写 cache、extracted 或 locale 文件。
- [ ] registration 未变化时生成内容保持稳定。

### 2.1 Build Watch 测试

- [ ] 添加真实 `vite build --watch` 首轮和二次构建测试。
- [ ] 覆盖直接 source 变化。
- [ ] 覆盖跨文件静态依赖变化。
- [ ] 覆盖 extracted 翻译变化。
- [ ] 覆盖 source 删除和重命名。
- [ ] 覆盖已有翻译不重复请求。
- [ ] 覆盖无内容变化时不重写文件。
- [ ] 测试只验证行为，不记录构建耗时。

## 3. Locale Lazy

### 3.1 配置与类型

- [ ] 增加 `loading.strategy = 'locale'`。
- [ ] 增加 `loading.preload` locale 列表。
- [ ] 增加 `loading.prefetch` locale 列表。
- [ ] 校验 locale 必须存在于配置。
- [ ] 禁止 source locale 出现在资源提示列表中。
- [ ] 禁止同一 locale 同时出现在 preload 和 prefetch 中。
- [ ] 对同一列表中的重复 locale 去重。
- [ ] `defaultLang` 不是 source locale 时自动使用 preload 语义。
- [ ] 未配置 `loading` 时保持 Phase 1 行为。

### 3.2 语言资产与 Manifest

- [ ] 为每个目标 locale 生成独立 Vite 语言模块。
- [ ] 生成静态可分析的 locale 动态 import 映射。
- [ ] 生成 Dev 和 Build 共用语义的 locale manifest。
- [ ] 保证生产资产遵守 Vite `base`。
- [ ] 保证生产资产使用内容 hash。
- [ ] 保证 source fallback 同步可用。
- [ ] 保证单个语言资产只包含该 locale 的活动 messages。
- [ ] 保持现有 cache、extracted 和 locale 持久化 schema。

### 3.3 资源提示

- [ ] 为非 source 的 `defaultLang` 和 preload locales 生成 `modulepreload`。
- [ ] 为 prefetch locales 生成 `prefetch`。
- [ ] 完全 lazy 的 locale 不生成 `<link>`。
- [ ] 资源提示引用最终的 base/hash URL。
- [ ] 不把 prefetch 完成作为语言切换的前置条件。
- [ ] Dev 和 Build 的资源提示语义一致。

### 3.4 Runtime

- [ ] `setLang(sourceLang)` 不发起网络请求。
- [ ] 已加载 locale 可以直接切换。
- [ ] 未加载 locale 等待动态 import 完成后再切换。
- [ ] 相同 locale 并发加载共享一个 Promise。
- [ ] 加载失败时保持当前语言并返回可处理错误。
- [ ] 非 source 的 `defaultLang` 在初始化后自动开始加载。
- [ ] 默认语言加载前使用 source fallback。
- [ ] 加载完成后通知 Runtime 订阅者。
- [ ] `null` 翻译继续稳定回退 source。

### 3.5 HMR 与框架测试

- [ ] source message 变化只更新受影响语言资产。
- [ ] extracted 翻译变化只更新对应 locale。
- [ ] 已加载 locale 通过 HMR 替换数据。
- [ ] 未加载 locale 不因 HMR 被提前请求。
- [ ] HMR 不重复注册 module 或累计旧翻译。
- [ ] 添加 Vanilla Dev/Build/切换测试。
- [ ] 添加 Vue Dev/Build/切换测试。
- [ ] 添加 React Dev/Build/切换测试。
- [ ] 添加 HTML Dev/Build/切换测试。
- [ ] 添加 base path、加载失败和并发去重测试。

## 4. Cache 容量控制

### 4.1 配置

- [ ] 增加 `cache.maxMessages`。
- [ ] 增加 `cache.maxBytes`。
- [ ] 两项都省略时不启用容量清理。
- [ ] 两项必须是正整数。
- [ ] 任一限制超出时启动清理。
- [ ] 同时配置时要求输出同时满足两个限制。

### 4.2 活跃判定与淘汰

- [ ] 根据 cache file records 和 ProjectState 计算活动 message IDs。
- [ ] 完成磁盘合并和 missing source 清理后再计算容量。
- [ ] 活动 messages 永不参与容量淘汰。
- [ ] 只淘汰没有活动引用的 Translation Memory。
- [ ] 淘汰候选按 message ID 稳定排序。
- [ ] 删除到同时满足条数和体积限制。
- [ ] `maxBytes` 使用稳定序列化后的 UTF-8 字节数。
- [ ] 活动数据自身超限时保留数据并 warning。
- [ ] 不写入时间戳、运行次数、访问次数或 LRU metadata。
- [ ] 使用现有原子写入流程保存清理结果。
- [ ] 不创建 cache 分片或 index 文件。

### 4.3 与现有 Cleanup 的关系

- [ ] `cleanup.orphanMessages: false` 时只在超限后删除非活跃记录。
- [ ] `cleanup.orphanMessages: true` 时继续删除全部非活跃记录。
- [ ] `cleanup.orphanMessages: true` 的优先级高于容量限制。
- [ ] `cleanup.missingSourceFiles` 继续控制缺失 source 的活动引用清理。

### 4.4 Cache 测试

- [ ] 覆盖默认永久保留历史 Translation Memory。
- [ ] 覆盖只配置 `maxMessages`。
- [ ] 覆盖只配置 `maxBytes`。
- [ ] 覆盖同时配置两个限制。
- [ ] 覆盖活动和非活跃 messages 混合场景。
- [ ] 覆盖活动数据自身超过限制。
- [ ] 覆盖 Agent 编辑和 Git 合并后的容量清理。
- [ ] 覆盖清理结果稳定且不丢活动翻译。

## 5. 文档与兼容

- [ ] 更新根 README 的 Phase 2 配置示例。
- [ ] 更新 `@boses/vite` README 的 `loading` 配置。
- [ ] 更新 `@boses/vite` README 的 `cache` 配置。
- [ ] 更新 `apps/docs` 用户文档中的 Phase 2 配置与行为说明。
- [ ] 说明 preload、prefetch 和完全 lazy 的区别。
- [ ] 说明 prefetch 是浏览器提示，不保证完成时间。
- [ ] 说明 Build Watch 遇到 Vite 配置变化时需要重启。
- [ ] 说明容量限制只淘汰非活跃 Translation Memory。
- [ ] 说明活动数据超限时会 warning 并保留。
- [ ] 检查并同步 `.agents/skills/integrate-ai-i18n`。
- [ ] 检查并同步 `.agents/skills/use-ai-i18n-mcp`。
- [ ] Phase 1 示例无需修改即可继续使用。

## 6. 质量检查

- [ ] 重要模块添加中文注释。
- [ ] 测试文件放在对应 package 的 `test` 目录。
- [ ] 检查修改后的源文件是否需要拆分，尽量不超过 400 行。
- [ ] 运行 `pnpm check`。
- [ ] 运行 `pnpm test`。
- [ ] 运行 `pnpm build`。
- [ ] 确认未新增性能 benchmark。
- [ ] 确认未引入 cache 分片、SSR、全目录扫描或额外 CLI。

## 7. Phase 2 完成定义

- [ ] Build Watch 在后续重建中复用 ProjectState。
- [ ] Build Watch 的变化、删除、重命名和 Translation Memory 行为通过测试。
- [ ] Locale Lazy 只加载当前或被提示加载的目标语言。
- [ ] preload、prefetch 和完全 lazy 行为通过 Dev/Build 测试。
- [ ] Locale 加载并发去重，失败时不进入半切换状态。
- [ ] Cache 可以按 message 数量或字节数限制历史规模。
- [ ] Cache 容量清理不删除活动翻译。
- [ ] Phase 1 默认协议、Runtime、配置和项目无需迁移。
- [ ] Vite Full Bundle Mode 和 native 插件仍为非阻塞观察项。
- [ ] 所有质量检查通过。
