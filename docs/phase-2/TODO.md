# Phase 2 TODO

> 对应文档：[Phase 2 PRD](./PRD.md)
>
> 只有 Phase 1 完成且对应启动门槛被真实数据命中后才执行。

## 1. 基准与启动门槛

- [ ] 建立 10,000 模块、5,000 message、5 locale benchmark fixture。
- [ ] 包含 JS/TS、React、Vue 混合模块。
- [ ] 包含相同 ID 跨 1/10/100 模块重复场景。
- [ ] 记录冷启动、cache hydrate、单文件 HMR、Build Watch 基线。
- [ ] 分离记录 Yuku parse、semantic、AST transfer、JS extraction 耗时。
- [ ] 记录模块注册输出体积和重复 message 体积。
- [ ] 记录 setLang 时间和 Runtime 内存。
- [ ] 记录 Provider batch、字符、Token 估算、耗时和失败。
- [ ] 记录硬件、Node、Vite、Yuku 版本。
- [ ] 为每个 Phase 2 子项目写明被命中的量化门槛。

## 2. Cache 分片（按需）

- [ ] 证明单 `cache.json` 已出现读写或 Git 合并瓶颈。
- [ ] 设计 cache index + fixed shard schema。
- [ ] 按 message ID hash 前缀稳定分片。
- [ ] 确保相同 ID 永远进入同一分片。
- [ ] 保持 extracted/locales schema 不变。
- [ ] 实现 Phase 1 单 cache 无损自动迁移。
- [ ] 使用原子目录切换或等价安全迁移策略。
- [ ] 未知 schema 禁止写入。
- [ ] 默认继续保留 orphan Translation Memory。
- [ ] 添加 Git 两分支新增 message 的合并 fixture。
- [ ] 添加同 ID 冲突翻译的明确诊断。

## 3. 精细失效与 Build Watch

- [ ] 扩展 module fingerprint：source/extractor/config/schema/dependencies。
- [ ] 持久化 reverse dependency 信息。
- [ ] source 变化只失效当前模块和必要 dependents。
- [ ] extracted 变化不得重新 parse source。
- [ ] locale metadata 变化只更新 manifest/runtime metadata。
- [ ] Provider 配置变化不得删除已有 Translation Memory。
- [ ] extractor/Yuku 升级只重建分析状态，不丢翻译。
- [ ] `vite build --watch` 复用相同 ProjectState 协议。
- [ ] message 未变化时不重写 locale 文件。
- [ ] registration 未变化时不改变输出 chunk hash。
- [ ] 文件删除、重命名不遗留活动 module references。
- [ ] 跑 benchmark 并记录最小失效闭包结果。

## 4. Locale Lazy（按需）

- [ ] 证明全部语言随模块注册已造成实际体积/内存问题。
- [ ] 设计 `loading.strategy = 'locale'` 稳定配置。
- [ ] 生成遵守 Vite base/hash 的 locale assets。
- [ ] 生成 Dev/Build 共用 manifest 语义。
- [ ] `setLang()` 动态加载目标 locale。
- [ ] 同 locale 并发请求共享 Promise。
- [ ] source fallback 始终同步可用。
- [ ] 加载失败不进入半切换状态。
- [ ] HMR 只更新受影响 locale。
- [ ] 添加浏览器缓存、失败重试和 base path 测试。
- [ ] 保证 Phase 1 全语言模式仍是默认且无回退。

## 5. Module × Locale 实验（严格按需）

- [ ] 证明 locale lazy 仍不能满足目标项目。
- [ ] 建立 module group × locale 资产原型。
- [ ] 处理 shared message 和多模块引用。
- [ ] 处理 dynamic import 与 setLang 并发顺序。
- [ ] 控制请求数量并记录真实网络结果。
- [ ] 验证 HMR 不重复请求和不丢 registration。
- [ ] 不依赖 pages/route 目录。
- [ ] 不依赖 Vite 私有 API。
- [ ] 真实项目验证前只标记 experimental。

## 6. Provider 调度升级（按需）

- [ ] 证明现有 debounce/batch 已命中 Provider 限流或吞吐瓶颈。
- [ ] 添加最大并发批次数。
- [ ] 解析并遵守 retry-after。
- [ ] 只对明确可重试错误指数退避。
- [ ] 批次过大时自适应拆分。
- [ ] 实现 Build 总等待时间上限。
- [ ] 取消 Dev 已过期且未发送的任务。
- [ ] 保持 message ID/locale in-flight 去重。
- [ ] 添加只读字符/Token 成本预算。
- [ ] 预算耗尽时按配置 warning/error 并保留 null。
- [ ] 验证重试不会重复写入或覆盖非空翻译。
- [ ] 验证日志/cache 不包含完整 Prompt 和原始响应。

## 7. Bundled Dev（实验）

- [ ] 目标项目实际启用 Bundled Dev 后再创建 CI job。
- [ ] 验证 JS/TS、React、Vue、HTML 显式 `t()`。
- [ ] 验证 virtual runtime/register 模块始终可达。
- [ ] 验证外部静态依赖全部通过公开 watch API 登记。
- [ ] 移除对 mixed/private module graph 的核心依赖。
- [ ] 验证 cache hydrate 后文件副作用仍正确恢复。
- [ ] registration/locales 无变化时不刷新。
- [ ] 对不兼容场景输出明确 warning。
- [ ] Bundled Dev SSR 保持 Not supported。
- [ ] 跟踪 Vite 官方迁移指南并更新能力矩阵。

## 8. Native 性能优化（最后手段）

- [ ] 用 profiler 证明 native/JS 边界是主要瓶颈。
- [ ] 先减少重复 parse 和完整 AST materialization。
- [ ] 尝试让 Yuku analyzer 返回更小的原生语义结果。
- [ ] 对 Vue template 小表达式做批量分析实验。
- [ ] 优先向 Yuku 上游贡献缺失能力。
- [ ] 只有以上失败后才设计窄 N-API extraction kernel。
- [ ] 不把 Vite 生命周期、Vue compiler、Runtime 或文件协议迁入 Rust。
- [ ] 为所有 native package 建立平台安装矩阵和 JS fallback 结论。

## 9. Schema 与兼容

- [ ] 为 cache/extracted/locale 添加 Phase 1 -> Phase 2 迁移 fixtures。
- [ ] 未知更高版本 schema 明确停止写入。
- [ ] 损坏分析缓存可以重建，但 Translation Memory 必须可恢复。
- [ ] stable 配置遵守 semver。
- [ ] experimental loading/Bundled Dev API 明确标记。
- [ ] Phase 1 示例无需修改即可继续使用默认模式。

## 10. 质量检查

- [ ] 运行 `pnpm lint`。
- [ ] 运行 `pnpm check`。
- [ ] 运行 `pnpm test`。
- [ ] 运行 `pnpm build`。
- [ ] 运行全部 benchmark 并保存结果。
- [ ] 检查 SSR、自动普通文本提取、全目录扫描和额外 CLI 没有被引入。

## 11. Phase 2 完成定义

- [ ] 每个已实现能力都有真实启动数据，不包含纯推测功能。
- [ ] Cache 升级不丢 Translation Memory。
- [ ] 增量失效范围有 benchmark 和集成测试支撑。
- [ ] Locale lazy 在真实项目证明减少体积或内存。
- [ ] Provider 调度不会重复收费或覆盖有效翻译。
- [ ] Bundled Dev 状态与 Vite 官方当前能力一致。
- [ ] Phase 1 默认协议、Runtime 和项目无需迁移即可继续工作。
