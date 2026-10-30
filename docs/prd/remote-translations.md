# 远程文案提交与译文快照

## 可选能力与来源

- 不配置 remote 时保留本地流程。publish 是可与本地 Provider 共存的提交增强；load 使用
  远程快照，并与 Provider 互斥，配置冲突直接拒绝。mode 默认为 replace，overlay 需显式启用。
- replace 模式不读取、覆盖或清理本地 translations，不打开或使用个人 SQLite 缓存；人工
  overrides 继续优先，extracted 和 locales 仍是派生产物。
- overlay 模式逐条按消息身份和目标语言解析：远程非 null 值 > 本地人工 overrides > 本地
  自动译文 > 原文。本地 Translation Memory/SQLite 沿用原流程；远程层独立保存，不写入
  translations、overrides 或 SQLite，只影响有效注册数据及派生 locales/dist。
- 接入方自行处理接口、鉴权、key、请求和响应转换。上传与下载保持稳定对应关系，内部
  source + comment 不能因接口省略 comment 而静默合并。全局语言字典无需按源码文件组织。
- 提交只新增或更新，不根据 Dev 的局部清单删除服务器文案。插件不实现服务端翻译队列、
  审核平台、双向同步或冲突选择。

## 快照与执行时机

- 提交成功只代表服务器接收，不等待翻译完成。单次提交和获取分别最多 30 秒，传递可用于
  取消网络请求的 AbortSignal；回调忽略取消也不能使插件无限等待。
- Dev 合并文案变化后后台同步，源码转换不等待网络。请求期间文案清单已变化时丢弃旧响应，
  后续批次使用新清单；没有自动轮询。
- Build 收齐当前可达模块图后提交并获取一次快照，随后固化注册数据、HTML 初始值和语言
  分包；本轮产物不在不同生成阶段重新请求服务器。固定服务端版本由适配器选择。
- 提交失败仅报告诊断。获取或快照校验失败使 Build 失败；Dev 报告错误并保留此前成功应用的
  快照。没有隐式历史缓存回退。
- 远程层是完整替换：没有返回的消息/locale 按 null 处理，空字符串仍为有效译文。
  消息归属、目标语言、重复结果冲突和模板占位符均在应用前校验；无效结果不能部分覆盖快照。
- replace 的 null 表示缺译；overlay 的 null 或省略表示撤销远程覆盖并恢复当前本地结果。
  Dev 本地文件更新不能反向覆盖有效远程值；请求失败不能被当作成功的空覆盖层。
- 缺译是否允许出包继续由 failOnMissingTranslations 决定，不与请求失败或提交接收状态混为一谈。
  overlay 检查最终合并结果，远程未覆盖但本地已有译文的项不算缺译。
- 服务器之后更新不会改变已生成的 dist；静态发布通过重新构建部署使用新译文。

## 配置与浏览器类型

- 复用 @ai-i18n/vite，/remote 子路径提供 defineRemote 和适配器类型，不新增 npm 包。
- 允许直接在 vite.config.ts 内联，也允许显式导入独立的 Node 模块；不自动发现配置文件。
  工厂只组织配置，网络请求放在回调内，认证代码不进入浏览器。
- publicMeta 仅接收显式选择的公开 JSON 对象，随成功应用的译文一起更新。版本是可选的
  不透明元数据，不默认比较大小，也不引入浏览器自动在线更新。
  overlay 中元数据标识远程层，不表示本地译文也属于该远程版本。
- virtual:ai-i18n 的 getTranslationMeta() 读取实际已应用的只读快照，运行时递归冻结。
  本地模式、尚未加载、无元数据、SSR 降级和 Vitest 专用 Runtime 返回 undefined。
  它不自动创建框架响应式依赖，也不加入自动导入集合。
- 类型注册使用 @ai-i18n/vite/runtime 的 Register.translationMeta，同时约束适配器返回端
  和浏览器读取端。应用的 Node 与浏览器 TS 工程都包含同一声明；生成声明引用共享类型，
  不根据网络响应生成类型，也不导入 Node 配置到浏览器。网络数据仍需运行时校验。

## 扫描与 Agent 边界

- 独立入口扫描不执行远程提交和获取；活动 Dev 扫描先结算已经在途的远程操作，不新增请求。
- 扫描结果的 translation_source 区分 local、remote 与 overlay；没有服务端数据的独立扫描不代表远程缺译。
  overlay 的独立扫描只检查本地层，活动 Dev 扫描保留已经应用的远程层且不新增请求。
- MCP 自动译文列表和写入保持本地契约，不代表远程覆盖率，也不修改服务端；远程模式的
  replace 自动缺译应通过服务端处理，overlay 可按任务授权补齐本地层。人工 overrides 按原契约操作，
  但 overlay 的远程有效值仍更优先。
- Codex 插件结束检查继续报告扫描失败，但不根据 remote 或 overlay 的本地缺译统计要求自动补写。

## 演示与验收

- `examples/remote` 使用本地 Hono 验证 key 提交、全局 JSON、类型安全 meta、缺译与无效
  快照；构建时临时启动后端，静态产物无需后端。演示控制接口仅在本机 Dev 运行。
- dev:overlay/build:overlay 使用独立 i18n-overlay 本地数据和 partial/withdrawn 服务端场景，
  验证部分覆盖、人工结果恢复和本地 UI/懒加载补齐。
- Dev 首次访问必须接收已经完成的远程快照，包含更新早于浏览器 Runtime 就绪的情况；
  懒加载模块首次注册也必须使用当前已应用数据，不依赖手动刷新。

## 权威入口

- [Hono 远程译文示例](../../examples/remote/README.md)
- [远程文案与译文](../../apps/docs/docs/guide/advanced/remote-translations.md)
- [RemoteAdapter](../../apps/docs/docs/api/vite/interfaces/remote-adapter.md)
- [getTranslationMeta()](../../apps/docs/docs/api/runtime/functions/get-translation-meta.md)
- Agent 配置与写入边界分别见 integrate-ai-i18n、use-ai-i18n-mcp 的 remote 引用。
