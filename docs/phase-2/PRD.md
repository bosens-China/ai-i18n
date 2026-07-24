# Phase 2 PRD：增量构建、按需语言与有界缓存

> 状态：Draft
>
> 前置条件：Phase 1 的默认协议、Runtime 和文件格式保持稳定。

## 1. 背景

Phase 1 已建立以下稳定能力：

- Dev 渐进分析，Build 处理入口可达模块图。
- 可提交到 Git 的 Translation Memory cache。
- 按源码路径生成的 extracted 文件。
- 按语言生成的 locales 文件。
- 模块注册携带全部配置语言。
- Provider 防抖、批处理、并发控制和缓存复用。
- Vue、React、Vanilla 和 HTML extractor。

Phase 2 不重做上述能力。本阶段解决三个明确问题：

1. `vite build --watch` 每轮 Build 都会重建 ProjectState，无法复用上一轮分析状态。
2. 模块注册携带全部语言，无法按语言加载，也无法声明资源加载优先级。
3. Translation Memory 默认永久保留，但项目无法限制 `cache.json` 的最大条数或体积。

本阶段不以性能 benchmark 为启动条件，也不建设性能测试体系。所有测试只验证行为、
兼容性和数据安全。

## 2. 产品目标

1. 让 `vite build --watch` 复用 ProjectState，并按正确的依赖闭包增量更新。
2. 提供按 locale 加载的语言资产。
3. 支持预加载、预取和完全按需加载三种资源提示。
4. 允许限制 `cache.json` 的 message 数量或序列化体积。
5. Cache 超限时只淘汰非活跃 Translation Memory，不删除活动翻译。
6. 保持 Phase 1 默认模式和文件协议兼容。

## 3. 实现原则

- 未配置 Phase 2 选项时，行为与 Phase 1 一致。
- 只依赖 Vite 公开插件 API。
- 相同输入生成稳定内容，不引入时间戳、运行次数或访问计数。
- 活动翻译优先保证正确性，容量限制不能导致活动翻译丢失。
- 资源提示是浏览器调度提示，不承诺资源一定在指定时间完成加载。
- 不为了未来能力增加 cache 分片、native kernel 或额外 CLI。

## 4. 持续非目标

Phase 2 不包括：

- 性能 benchmark、性能预算或 profiler 基础设施。
- cache 分片或多个 Translation Memory 文件。
- module group × locale 二维拆分。
- Provider 成本统计或新的通用重试调度层。
- Vite Full Bundle Mode 的正式兼容实现。
- Rust、Zig、N-API 或其他 native extraction kernel。
- SSR 或服务端请求级 locale。
- 自动提取没有 `t()` 的普通 UI 文本。
- 路由目录、`src/pages` 或框架路由器约定。
- 扫描 Vite 入口不可达目录的 CLI。
- sync、scan、generate 等独立命令。
- 翻译管理后台或默认远程 Translation Memory 服务。
- Vite 7 或更低版本。

所有产品流程仍由 `vite dev`、`vite build` 和 `vite build --watch` 驱动。

## 5. Build Watch 增量状态

### 5.1 生命周期

普通 `vite build` 继续使用新鲜 ProjectState，保证单次构建不继承其他构建的活动模块。

`vite build --watch` 在首轮构建时创建 ProjectState。后续重建复用该状态，不在每次
`buildStart` 时执行全量 reset。

重新启动 Watch 进程时，插件继续从磁盘 cache 恢复 Translation Memory。分析状态允许重建，
Translation Memory 不得丢失。

### 5.2 失效规则

- source 变化：重新分析当前模块及必要的 reverse dependents。
- 静态依赖变化：重新分析依赖该文件且提取结果可能变化的模块。
- extracted 翻译变化：只合并 cache、locale 和 registration，不重新 parse source。
- locale 文件变化：只恢复对应翻译并更新受影响的 registration。
- source 删除：删除活动文件引用，并刷新必要的 dependents。
- source 重命名：按删除旧模块和新增新模块处理，不重复请求已有 Translation Memory。
- extractor、schema 或提取配置不兼容：重建分析状态，保留兼容的 Translation Memory。

Vite 配置文件及其依赖变化后，用户需要重启 `vite build --watch`。插件不在 Watch 进程内
模拟 Vite 配置热重载。

### 5.3 写入与产物

- 没有内容变化时，不重写 cache、extracted 或 locale 文件。
- 没有 registration 变化时，生成内容保持稳定。
- Watch 重建不得重复请求已有翻译。
- 文件删除或重命名后，不保留错误的活动 module reference。
- Build Watch 和普通 Build 使用相同的 schema、路径和冲突检测规则。

## 6. Locale Lazy

### 6.1 默认兼容

未配置 `loading` 时，继续使用 Phase 1 的全语言模块注册模式。现有项目无需修改配置，
Runtime API 和文件协议保持不变。

### 6.2 配置

按 locale 加载使用以下配置：

```ts
aiI18n({
  loading: {
    strategy: 'locale',
    preload: ['en-US'],
    prefetch: ['ja-JP'],
  },
});
```

配置规则：

- `preload` 和 `prefetch` 只能引用 `locales` 中已配置的目标语言。
- source locale 不生成语言资产，也不能出现在任一列表中。
- 同一 locale 同时出现在两个列表中时，配置校验失败。
- `defaultLang` 不是 source locale 时，插件自动按 preload 语义启动加载。
- `preload` 和 `prefetch` 中的重复 locale 需要去重。

### 6.3 语言资产

- 每个目标 locale 生成独立的 Vite 语言模块。
- Runtime 通过静态可分析的动态 import 加载语言模块。
- 生产构建中的语言资产遵守 Vite `base`、内容 hash 和资源 URL 规则。
- Dev 和 Build 使用相同的 locale manifest 语义。
- source fallback 始终同步可用。
- 语言资产只包含该 locale 的活动 messages。

### 6.4 资源提示

插件按以下方式处理语言资源：

| 配置                                    | 浏览器提示      | 行为                         |
| --------------------------------------- | --------------- | ---------------------------- |
| 非 source 的 `defaultLang` 或 `preload` | `modulepreload` | 尽早下载并准备语言模块       |
| `prefetch`                              | `prefetch`      | 以较低优先级提前缓存语言模块 |
| 未配置                                  | 无 `<link>`     | 调用 `setLang()` 时才加载    |

`modulepreload` 和 `prefetch` 只表达加载意图。浏览器可以根据网络、电量和自身调度策略调整
实际优先级。插件不得把 prefetch 成功作为切换语言的前置条件。

### 6.5 Runtime 行为

- `setLang(sourceLang)` 同步切换到 source locale，不发起网络请求。
- 目标 locale 已加载时，`setLang()` 直接切换并通知订阅者。
- 目标 locale 未加载时，`setLang()` 等待对应语言模块。
- 相同 locale 的并发加载共享一个 Promise。
- 加载成功后再提交语言切换，避免半切换状态。
- 加载失败时保持当前语言，并返回可处理的错误。
- 缺失或为 `null` 的翻译继续回退 source。
- 非 source 的 `defaultLang` 在 Runtime 初始化后自动开始加载。
- 默认语言尚未加载完成时，`t()` 暂时返回 source；加载完成后通知订阅者更新。

### 6.6 HMR

- source message 变化时，只更新包含该 message 的语言资产和 registration。
- extracted 翻译变化时，只更新对应 locale。
- 已加载 locale 通过 HMR 替换数据。
- 未加载 locale 只更新后续请求的资源，不触发无意义加载。
- HMR 不重复注册 module，也不累计旧翻译。

## 7. Cache 容量控制

### 7.1 默认行为

未配置容量限制时，`cache.json` 继续永久保留 Translation Memory。文件移动、删除和暂时不可达
都不会自动删除历史翻译。

本阶段继续使用单个 `cache.json`，不实现 cache 分片。

### 7.2 配置

```ts
aiI18n({
  cache: {
    maxMessages: 20_000,
    maxBytes: 10 * 1024 * 1024,
  },
});
```

配置规则：

- `maxMessages` 是 `cache.messages` 允许保留的最大条数。
- `maxBytes` 是稳定序列化后整个 `cache.json` 的最大字节数。
- 两项都省略时，不启用容量清理。
- 两项同时配置时，任一限制超出都会启动清理。
- 两项必须是正整数。

### 7.3 活跃定义

message 满足以下任一条件时视为活动：

- 当前 cache file record 的 `messageIds` 仍引用该 message。
- 当前 ProjectState 中的活动模块仍引用该 message。

活动 message 及其翻译不得因容量限制被删除。

没有任何活动引用的 message 是非活跃 Translation Memory，可以在超限时删除。

### 7.4 淘汰规则

1. 先完成磁盘变更合并、缺失 source 清理和活动引用校准。
2. 只有 cache 超出配置限制时才开始淘汰。
3. 只选择非活跃 messages。
4. 候选项按 message ID 升序稳定排序，并按该顺序删除。
5. 持续删除，直到同时满足 `maxMessages` 和 `maxBytes`。
6. 删除结果通过现有临时文件加 rename 的方式原子写入。

容量控制不保存访问时间、运行次数或 LRU 计数，避免每次运行产生无意义 Git diff。

如果活动 messages 本身已超过限制，插件保留全部活动数据并输出 warning。容量限制是软上限，
不能以破坏当前项目翻译为代价强制满足。

### 7.5 与现有清理配置的关系

- `cleanup.orphanMessages: false`：默认保留全部历史；配置容量后只在超限时删除非活跃记录。
- `cleanup.orphanMessages: true`：继续删除全部非活跃记录，优先级高于容量限制。
- `cleanup.missingSourceFiles`：继续决定不存在的 source 是否从活动 file records 中移除。

## 8. Provider 现状

`@ai-i18n/openai` 已支持可配置的 `maxRetries`，默认值为 `3`。ProviderCoordinator 已支持
防抖、按长度分批、最大并发批次数和 in-flight 去重。

Phase 2 不再增加第二层通用重试，避免 adapter 和 coordinator 同时重试同一批请求。Provider
最终失败时继续保留 `null`，不得覆盖已有非空翻译。

上述能力属于 Phase 1 回归边界，不作为 Phase 2 新功能。

## 9. 观察项

### 9.1 Vite Full Bundle Mode

Vite Full Bundle Mode 保持观察状态。Vite 提供可用且稳定的公开插件迁移方案前，本项目不承诺
兼容，不创建阻塞 Phase 2 的实现任务。

现有代码继续避免依赖 Vite 私有字段，为未来兼容保留空间。

### 9.2 Native 插件

Rust 或其他 native extraction 方案等待 Vite 或 Rolldown 提供正式、稳定的 native 插件支持。

在此之前：

- 不设计自有 N-API extraction kernel。
- 不把 Vite 生命周期、Vue compiler、Runtime 或文件协议迁入 Rust。
- 不把 native 支持列入 Phase 2 验收条件。

## 10. Schema 与兼容

- Cache 继续使用 Phase 1 单文件 schema。
- extracted 和 locale 持久化文件继续使用 Phase 1 schema。
- Cache 容量控制不写入时间戳、活跃度或额外运行时 metadata。
- Locale Lazy 可以增加 Runtime manifest，但不得静默改写现有持久化文件语义。
- 未知更高版本 schema 继续停止写入。
- Phase 1 示例和默认配置无需迁移。

## 11. 验收标准

### 11.1 Build Watch

- 首轮 Build 后，后续 Watch 重建不全量 reset ProjectState。
- source 变化只刷新当前模块及必要 dependents。
- extracted 或 locale 变化不重新 parse source。
- 删除和重命名不遗留活动引用。
- 已有 Translation Memory 不重复请求 Provider。
- 内容未变化时不重写文件或改变 registration 内容。

### 11.2 Locale Lazy

- `strategy: 'locale'` 只在需要时加载目标 locale。
- 非 source 的 default/preload locale 生成正确的 `modulepreload` 提示。
- prefetch locale 生成正确的 `prefetch` 提示。
- 完全 lazy 的 locale 不产生资源提示。
- 语言资产遵守 Vite `base` 和内容 hash。
- 同 locale 并发加载共享一个 Promise。
- 加载失败时保持当前语言。
- source 和 `null` fallback 行为正确。
- Vanilla、Vue、React 和 HTML 共用相同语义。

### 11.3 Cache 容量

- 默认配置继续永久保留 Translation Memory。
- `maxMessages` 和 `maxBytes` 都能独立触发清理。
- 同时配置两个限制时，输出同时满足两项。
- 只删除非活跃 messages。
- 活动数据超过限制时保留数据并 warning。
- 清理结果稳定、原子且不包含活跃度 metadata。
- 不创建 cache 分片文件。

### 11.4 兼容与质量

- Phase 1 默认模式、Runtime 和文件协议保持兼容。
- `pnpm check`、`pnpm test` 和 `pnpm build` 通过。
- 新增测试只验证功能、兼容性和数据安全，不新增性能 benchmark。
- SSR、普通文本自动提取、全目录扫描和额外 CLI 仍然不存在。
