# Phase 2 验收记录

> 更新日期：2026-07-24
>
> 当前范围：P0 + P1（Build Watch）+ P2（Cache 容量）+ P3（Locale Lazy）。
> Phase 2 已实现，等待外部验收。

## P0

- Vite 8 Build Watch 生命周期、当前模块图和 locale 资产 Spike 已完成。
- Phase 2 PRD 已从 Draft 推进为 Ready。
- import 移除、`setLang()` 竞态、HTML fallback 和 cache 软上限语义已锁定。
- 详细证据见 [实施 Spike](./SPIKES.md)。

## P1 Build Watch

- 普通 Build 继续 reset 分析状态；Build Watch 后续轮次复用 ProjectState。
- 未变化 source 通过 fingerprint 复用 AST。
- 静态依赖变化重新 parse 当前文件，并刷新必要 reverse dependents。
- extracted 和目标 locale 编辑只恢复翻译与 registration，不重新 parse source。
- source 删除、重命名和 import 移除会校准当前活动模块。
- Translation Memory 在移动和暂时不可达后继续保留，已有翻译不重复请求 Provider。
- 相同内容重建不改写 cache、extracted 或 locale 文件。

真实 `vite build --watch` 测试覆盖直接 source、静态依赖、extracted、locale、删除、重命名、
不可达模块、Provider 复用和稳定文件写入。

## P3 Locale Lazy

- `loading.strategy = 'locale'` 为每个目标 locale 生成独立的内容 hash chunk；省略
  `loading` 时继续使用 Phase 1 全语言 registration。
- 静态动态 import manifest 在 Dev 使用公开 locale URL，在 Build 指向 virtual locale
  module。Dev 预加载稳定 wrapper，避免入口模块 transform 前冻结不完整语言快照；Build
  在 `renderChunk` 使用完整模块图固化活动 messages。
- 非 source 的 `defaultLang` 与 `preload` 生成 `modulepreload`，`prefetch` 生成低优先级提示，
  完全 lazy locale 不注入 `<link>`。
- 绝对 base、相对 base、多 HTML 入口、首次干净 Build 和复杂 Vue 模块图均通过真实 Vite
  构建测试。
- Runtime 覆盖 source 同步切换、已加载直接切换、Promise 去重、加载失败原子性、最后调用
  获胜、目标默认语言后台加载和 `null` source fallback。
- HMR 对已加载 locale 替换数据；未加载 locale 记录最新数据但不触发动态 import。extracted
  编辑只发送实际变化 locale 的更新。
- Vanilla、Vue、React 和 HTML 均覆盖 Build 或 Dev 资产行为及异步切换后的订阅更新。
- Vue Demo 以 `en-US` 默认预加载、`ja-JP` 首次切换加载完成真实浏览器验证；同一轮使用
  `@ai-i18n/mcp` 三项 stdio 工具写入 9 条日语翻译并回读缺失为 0。

## P2 Cache 容量

- 新增可选的 `cache.maxMessages` 与 `cache.maxBytes`；两者独立生效，必须是正整数，全部
  省略时保持永久 Translation Memory 的兼容行为。
- 容量检查位于磁盘编辑合并、missing source 清理和 orphan cleanup 之后，Dev、Build、
  Build Watch、Provider 与 locale reconciliation 共用同一 FileStore 路径。
- 活动 message IDs 同时取 cache file records 与当前 ProjectState 的并集。活动翻译永不
  参与容量淘汰；受保护数据自身超限时保留并通过 Vite logger 输出 warning。
- 非活跃候选按 message ID 稳定排序。`maxBytes` 使用最终稳定序列化内容的 UTF-8 字节数；
  两项同时配置时，删除到同时满足两个限制。
- 实现不增加时间戳、访问次数、LRU metadata、cache 分片或额外依赖，继续使用原子写入。
- 9 个专项测试覆盖默认保留、两个独立限制、组合限制、稳定淘汰、活动保护、cleanup
  优先级、missing source、Agent/Git 磁盘编辑合并和无变化不重写。

## 质量门禁

- `pnpm check`：通过。
- `pnpm test`：24 个测试文件、168 个测试通过。
- `pnpm build`：6 个发布包构建、publint 和类型产物检查通过。
- `pnpm docs:build`：Vanilla、Vue、React 示例与 Astro Starlight 文档站构建通过。
- 修改后的 `packages/vite/src` 文件均不超过 400 行。
