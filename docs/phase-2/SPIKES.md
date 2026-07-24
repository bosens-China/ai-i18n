# Phase 2 实施 Spike

> 日期：2026-07-24
>
> 结论：P0 通过，Phase 2 可以按 Build Watch → Cache 容量 → Locale Lazy 的顺序实施。

## 1. Vite Build Watch

使用仓库当前 Vite 8.1.5 执行了临时真实 `build({ build: { watch: {} } })` 项目，结论如下：

- `this.meta.watchMode` 可以区分普通 Build 与 Build Watch。
- 文件事件先进入 `watchChange`，随后进入下一轮 `buildStart`。
- `generateBundle` 每轮都会执行，适合作为活动模块图的校准点。
- `closeBundle` 不能用作每轮校准点；实际观察中它在 watcher 关闭时执行。
- `this.getModuleIds()` 和 `this.getModuleInfo()` 返回当前轮模块图。移除 import 后，旧依赖不再
  出现在集合中。
- 注册虚拟模块可以用 `addWatchFile()` 关联 source、extracted 和 locale 文件；磁盘翻译变化
  会触发注册内容重载。

因此 Build Watch 使用以下公开 API：

1. `watchChange` 收集删除和协议文件变化。
2. `buildStart` 合并磁盘变化，但不 reset Watch ProjectState。
3. source transform 通过 fingerprint 复用未变化 AST。
4. `generateBundle` 根据 `getModuleIds()` 移除不再可达的活动模块。

Vite 配置、插件实现、extractor 或 schema 变化仍通过重启 Watch 进程生效，不在运行中的
Watcher 内模拟配置热重载。

## 2. Locale Lazy 资产

使用两个 source 模块和一个 virtual locale module 执行了真实 Vite Build：

- 静态字面量 `import('virtual:locale/en-US')` 生成独立的
  `assets/en-US-[content-hash].js` chunk。
- `transformIndexHtml` 的 build `context.bundle` 可以通过 locale virtual module 的
  `facadeModuleId` 找到最终 chunk。
- 使用 resolved `base` 与 `chunk.fileName` 注入的 `modulepreload` 指向最终 hash URL。
- 首次干净 Build 中，locale virtual module 的 load 发生在两个可达 source transform 完成之后，
  能读取完整活动消息集合。

Locale Lazy 后续采用“一 locale 一个 virtual module + 静态动态 import manifest +
`transformIndexHtml` 资源提示”的实现方向。P3 必须保留首次干净 Build、相对/绝对 base、
多 HTML 入口和完整活动消息的真实构建回归；不依赖 Vite 私有字段。

P3 实施时，复杂 Vue 模块图补充暴露了两个时序边界：

- locale virtual module 的 `load` 可能早于后续 TS/TSX transform，因此 Build 在
  `renderChunk` 使用完整模块图固化语言内容。
- Dev 的 `modulepreload` 可能在入口模块 transform 前请求语言资产。公开 locale URL 因此只
  返回稳定 wrapper，Runtime 实际使用时再动态读取 locale virtual module，避免预加载冻结
  只有 HTML 文案的不完整快照。
- HTML 提取必须运行在 `transformIndexHtml: pre`，该阶段没有最终 hash bundle。Dev 资源提示
  仍由该钩子注入，Build 在公开的后置 `generateBundle` 钩子根据最终 chunk 注入。

两条路径均只使用 Vite 8 公开插件 API。

## 3. 已锁定产品语义

- Watch 中移除 import 后，已不可达模块退出活动 ProjectState，但 Translation Memory 继续保留。
- 不同 locale 的并发 `setLang()` 采用最后一次调用获胜。
- Locale Lazy 下 HTML 首屏使用同步 source fallback，目标 locale 加载后再更新。
- Cache 的 `maxBytes` 若因受保护 file records 或活动 messages 无法满足，保留数据并 warning。
