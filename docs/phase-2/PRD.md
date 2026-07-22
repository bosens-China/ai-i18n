# Phase 2 PRD：规模化增量与按需语言资产

> 状态：Draft
>
> 前置条件：Phase 1 验收完成，并至少有一个真实 Vue 项目和一个 React/Vanilla 项目接入。

## 1. 背景

Phase 1 已建立以下稳定协议：

- Dev 渐进、Build 完整可达模块图。
- 可提交的 Translation Memory cache。
- 按源码路径生成的 extracted 文件。
- 按语言生成的 locales 文件。
- 模块级注册携带全部配置语言。
- 自动 Provider 防抖、批处理和缓存复用。
- Vue、React、HTML extractor 组合。

Phase 2 不重做这些协议，只处理真实项目测量后出现的规模问题：单个 cache 文件过大、全部语言随模块加载造成的体积、Build Watch 失效范围、Provider 吞吐以及 Vite Bundled Dev 兼容。

## 2. 启动原则

Phase 2 的能力必须由真实数据触发，不因为“未来可能需要”而提前实现。

满足以下任一条件才启动对应项：

- `cache.json` 读写、Git diff 或合并冲突已成为实际瓶颈。
- 全语言模块注册造成明确的网络、解析或内存问题。
- 大项目单文件 HMR 重新分析范围不可接受。
- Provider 批次吞吐或限流影响 Dev/Build。
- 目标项目实际启用 Vite Bundled Dev。
- Yuku native binding 或 AST transfer 被 profiler 证明为主要瓶颈。

## 3. 产品目标

1. 在不破坏 Phase 1 schema 语义的前提下扩展可分片 cache。
2. 支持真正按需加载的 locale 资产，而不是只把文件拆开后全部打包。
3. 改善 `vite build --watch` 和大项目 Dev 的最小失效范围。
4. 提供 Provider 并发、限流、重试和成本统计。
5. 对 Vite Bundled Dev 建立实验兼容矩阵。
6. 用 benchmark 决定是否需要更深的 native 优化。

## 4. 持续非目标

Phase 2 仍然不包括：

- SSR 或服务端请求级 locale。
- 自动提取没有 `t()` 的普通 UI 文本。
- 路由目录、`src/pages` 或框架路由器约定。
- 扫描 Vite 入口不可达的全目录 CLI。
- sync、scan、generate 等独立命令。
- 翻译管理后台。
- 默认远程 Translation Memory 服务。
- Vite 7 或更低版本。
- 没有 profiler 证据时自研 Rust parser。

所有能力仍然只能由 `vite dev`、`vite build` 及其原生 watch 形态驱动。

## 5. 基准与可观测性

建立包含以下规模的 benchmark fixture：

- 10,000 个受支持模块。
- 5,000 个唯一 message IDs。
- 5 个目标语言。
- 重复 ID 跨 1、10、100 个模块分布。
- JS/TS、React、Vue 混合模块。

记录：

- 冷启动初始化耗时。
- cache hydrate、校验和写入耗时。
- 单文件 source/extracted/locale 变化的失效闭包。
- Yuku parse/analyze/AST transfer 各阶段耗时。
- 模块注册代码体积和重复 message 体积。
- setLang 耗时和内存。
- Provider cache hit、batch 数、字符数、Token 估算、耗时、失败和重试。

统计默认只输出汇总，不包含完整业务文案、Prompt、API key 或 Provider 原始响应。

## 6. Cache 规模化

### 6.1 Phase 1 兼容

Phase 1 的单 `cache.json` 继续是默认稳定模式。只有测得读写或 Git 冲突问题后，才启用分片：

```text
i18n/
├── cache.json                 # index + schema + config fingerprint
└── cache/
    ├── messages-00.json
    ├── messages-01.json
    └── files.json
```

### 6.2 分片原则

- message 按稳定 ID hash 前缀分片，不按 pages/route 分片。
- 相同 ID 始终进入同一分片。
- 分片数量固定且版本化，避免每次规模变化导致全量重排。
- extracted 和 locales 对 Agent/项目的协议保持不变。
- Phase 1 单文件 cache 可以自动升级；升级前必须保留备份或原子替换。
- 不自动删除历史 Translation Memory。

### 6.3 Git 合并

- 文件稳定排序。
- 不保存时间戳和运行次数。
- 相同 ID 的不同非空翻译仍然报冲突。
- 可以提供文档化 merge driver，但不得要求用户安装额外 CLI 才能正常使用。

## 7. 增量失效优化

### 7.1 组合 fingerprint

每个模块至少包含：

- 文件内容 hash。
- extractor 名称与版本。
- schema 和 key 协议版本。
- 影响提取的配置 hash。
- 跨文件静态依赖 hash。

### 7.2 规则

- source 变化：重新分析当前模块。
- 静态依赖变化：只重新分析 reverse dependents。
- extracted 翻译变化：不重新 parse source，只更新对应 message/cache/locale/registration。
- locale metadata 变化：只更新 Runtime manifest 和相关 locale 产物。
- Provider 配置变化：不丢弃已有翻译，只影响后续 `null` 请求。
- Yuku/extractor/schema 不兼容：失效相应分析结果，但保留可兼容 Translation Memory。

### 7.3 Build Watch

`vite build --watch` 必须复用同一 ProjectState 协议：

- 不重复翻译 cache 已有值。
- 没有 message 变化时不重写 locales。
- 没有 registration payload 变化时不改变输出 chunk hash。
- 文件删除和重命名不遗留活动引用。

## 8. Locale 按需加载

### 8.1 默认兼容

Phase 1 的“模块携带全部语言”继续是默认稳定模式。

### 8.2 Locale lazy 模式

测得体积问题后提供：

```ts
aiI18n({
  loading: {
    strategy: 'locale',
  },
})
```

行为：

- source fallback 保持同步可用。
- `setLang(value)` 动态加载目标 locale 资产。
- 相同 locale 并发调用共享一个 Promise。
- 加载失败保持当前语言或回退源语言，并返回可处理错误。
- locale 资产遵守 Vite base 和构建 hash。
- Dev 与 Build 使用相同 manifest 语义。

### 8.3 模块与语言二维拆分

只有 locale lazy 仍无法满足大型动态应用时，才实验：

```ts
loading: {
  strategy: 'module-locale',
}
```

它会形成 module group × locale 资产矩阵，因此必须先证明：

- 请求数量可控。
- shared message 归属确定。
- 动态模块激活与 locale 加载顺序正确。
- HMR 不重复请求或丢失 registration。
- 不依赖 Vite 私有 API。

该模式在真实项目验证前保持 experimental。

## 9. Provider 调度升级

Phase 1 已有 debounce、batch 和 in-flight 去重。Phase 2 只在有实际限流问题时增加：

- 最大并发批次数。
- Provider 返回的 retry-after 处理。
- 仅针对可重试错误的指数退避。
- 单批次过大时的自适应拆分。
- Build 总等待时间上限。
- 可取消 Dev 过期请求。
- Token/字符成本预算和只读统计。

约束：

- 重试不得绕过 message ID/locale 去重。
- 失败不得覆盖已有非空翻译。
- 预算耗尽时保留 null 并按配置 warning/error。
- 不在 cache 中保存完整 Prompt 或原始响应。

## 10. Bundled Dev

Vite Bundled Dev 在官方仍为实验能力时，本项目只提供实验支持：

| 模式 | 目标级别 |
| --- | --- |
| 普通 Vite Dev | Stable |
| Vite Build | Stable |
| Vite Build Watch | Stable |
| Bundled Dev CSR | Experimental |
| Bundled Dev SSR | Not supported |

要求：

- virtual runtime/register 模块始终位于可达图。
- 所有外部静态依赖通过公开 watch API 登记。
- 不依赖 mixed module graph 或私有字段完成核心功能。
- 缓存恢复后仍能重建文件写入副作用。
- registration/locales 未变化时不触发无意义刷新。
- 不兼容时输出明确 warning，不静默产生错误翻译。

只有 Vite 发布稳定插件迁移指南且真实项目通过后，才提升为 Stable。

## 11. Native 优化决策

Phase 1 已优先采用 Yuku。Phase 2 只有 profiler 证明以下任一项为主要瓶颈时才继续 native 工作：

- AST 从 Zig/Rust 向 JS 传输。
- JS 侧静态求值或 message extraction。
- 大型 Vue template 中大量独立表达式分析。

优化顺序：

1. 减少重复 parse 和 AST materialization。
2. 使用 Yuku analyzer 的原生语义查询返回更小结果。
3. 批量处理 Vue template 表达式。
4. 向 Yuku 上游贡献必要能力。
5. 最后才评估窄 N-API native extraction kernel。

即使需要 native kernel，Vite 生命周期、Vue compiler、文件协议和 Runtime 仍保留在 TypeScript，不将整个插件改写为 Rust。

## 12. Schema 与迁移

- cache、extracted、locale 必须带 schema version。
- Phase 1 文件必须自动迁移或给出明确错误，不能静默覆盖。
- 未知更高版本 schema 必须停止写入。
- Translation Memory 迁移优先于分析缓存；不可兼容分析记录可以重建，翻译不可丢失。
- experimental loading 配置不纳入稳定兼容承诺，稳定后再遵守 semver。

## 13. 验收标准

- benchmark 可复现并记录真实硬件、Node、Vite、Yuku 版本。
- 分片 cache 只在命中启动门槛时实现，并能无损迁移 Phase 1 数据。
- 单文件变化只失效正确依赖闭包。
- Build Watch 无 message 变化时不重写 locale 或改变相关 chunk hash。
- locale lazy 模式只请求选择的目标语言。
- locale 加载并发去重，失败时源语言 fallback 正确。
- module-locale experimental 不依赖 pages 目录或 Vite 私有 API。
- Provider 限流和重试不会重复收费或覆盖有效翻译。
- Bundled Dev 兼容状态与 Vite 官方当前能力一致。
- Phase 1 默认模式和文件协议保持兼容。
- SSR、自动普通文本提取和额外 CLI 仍然不存在。
