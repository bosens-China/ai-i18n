# ai-i18n 现行产品决策

> 状态：现行。本文记录已经确认且仍然有效的产品决策、设计原因与边界，不替代用户 API 文档、包 README 或源码类型。

## 文档边界

- 用户可见的 API、配置和接入流程以 apps/docs 为准。
- 包级安装、运行与开发者配置以各 packages/*/README.md 为准。
- MCP 的公开工具契约以 packages/mcp/README.md 与源码 schema 为准。
- 本文只记录跨模块决策。参数表、测试数量、阶段任务和实现过程不在本文重复。
- 新决策替换旧决策时，直接修改对应主题；不追加 Phase 文档让读者自行判断优先级。

## 产品范围

### 平台与包边界

- ai-i18n 面向 Vite 8 项目，采用 pnpm monorepo 发布 Core、Analyzer、Vite、ESLint、OpenAI 和 MCP 包。
- 基础 Vite 包保持框架中立。Vue 与 React 适配器按最终框架模式按需启用，不把框架运行时带入 Vanilla 项目。
- 服务端渲染不在支持范围内。浏览器 Runtime 使用应用级状态，服务端共享会造成跨请求状态污染。
- 解析器采用 Yuku。它已经通过正确性、性能和跨平台准入；不把解析器选择暴露为公共配置，避免形成无收益的兼容面。

### 显式提取与消息标识

- 插件只提取显式的 t()、tagged template、Vue tRef() 和受支持的静态文案树调用；不会猜测普通文本、JSXText 或业务属性是否需要翻译。
- 消息 ID 由 source 与可选的静态 comment 构成，不包含文件路径。相同语义可复用 Translation Memory；需要区分语义时必须传入 comment。
- 缺失译文保持 null，Runtime 回退 source 文案。Provider 与普通补译只补缺失字段，不能静默覆盖已提交译文。
- defineI18nMessages() 是编译期宏，用于成员级静态集合访问。整棵静态文案树直接传给 t() 或 Vue tRef() 时不需要宏。

## Runtime 与框架

### 框架模式与自动导入

- 插件在 Vanilla、Vue、React 三种互斥模式中运行。默认由最终 Vite 插件列表推断，也允许显式覆盖；同时命中 Vue 与 React 时拒绝启动。
- 显式从 virtual:ai-i18n 导入的 API 始终可用。自动导入只减少 import 样板，不改变 Runtime 的导出边界。
- 三种模式都自动导入 t()、语言控制 API 与 subscribe()；Vue 额外自动导入 useI18n() 与 tRef()，React 额外自动导入 useI18n()。
- 自动导入按未绑定的值引用注入，覆盖直接调用、函数传递和对象简写；局部 binding、属性名、类型位置与赋值目标不能触发注入。
- 框架组件应通过 useI18n() 获得 t()，以订阅语言变化。顶层 t() 适合普通模块、事件和即时日志，不会建立组件订阅。
- getLang() 与 getLangLoadState() 返回调用时快照。ESLint 提示模块顶层缓存和可确定的组件渲染读取；action、事件与普通函数可以按需读取，跨文件 store 数据流不做不可靠推断。

### 响应式翻译

- Vue 的 tRef() 是独立导出，不属于 useI18n() 返回值。它在 setup 或 composable 中创建只读 ComputedRef，支持字符串、tagged template 和静态文案树。
- t(messages) 返回当前语言的同形快照；Vue tRef(messages) 返回随 Runtime revision 更新的同形只读计算值。输入必须是纯静态文案树。
- 不在模板、JSX 或渲染函数中调用 tRef()，避免每次渲染创建新的 computed。
- React 适配器使用 useSyncExternalStore 订阅 Runtime revision，并在 revision 变化时更新 Hook 返回的 t() 引用，以兼容 React Compiler 的缓存语义。

### 语言加载

- 未配置 loading 时，所有语言随 Runtime 注册。配置 loading 后，目标语言按 locale 拆分为独立资源。
- getLangLoadState() 提供 idle、loading、error 的稳定快照；Vue 与 React 的 useI18n() 同时暴露加载状态、布尔值和错误。
- 并发切换采用 last-call-wins。过期请求的完成或失败不能覆盖最新目标语言的状态。

## 翻译与持久化

### 文件职责与最终值

- translations.json 是 AI 与 Provider 的 Translation Memory；overrides.json 保存人工审校；extracted/ 保存插件生成的源码结构；locales/ 是派生运行时产物。
- 最终译文优先级固定为：comment 对应的人工值、同 source 的人工默认值、AI 翻译、source fallback。
- 人工审校必须写入 overrides.json，不污染 AI Translation Memory。空字符串是有效人工译文。
- 提交源码、生成的类型声明、translations.json 和 overrides.json；extracted/ 与 locales/ 可由 Build 重建，不提交。

### 并发与兼容性

- Vite 与 MCP 统一使用跨进程锁、锁内重读、字段级更新和原子替换。内存 ProjectState 只用于加速和 Runtime 更新，磁盘文件才是写入真相。
- 不保留未发布旧 schema、旧文件结构或旧 MCP 工具参数的兼容层。
- sourceLang 变更时，当前实现会在 comment 一致且历史候选唯一时尽力复用历史翻译；候选不唯一时保持缺失，不猜测。这是保守兼容行为，不构成公开的稳定迁移承诺。
- Translation Memory 的容量限制与 orphan 清理只淘汰非活动历史消息，不能为满足上限而破坏当前源码仍引用的译文。

### Vite 生命周期与 Provider

- Dev 渐进处理浏览器实际请求到的模块；Build 以入口可达模块图进行完整处理；Build Watch 复用未变化的分析结果并在必要时校准活动集合。
- Vite 配置、提取规则或 schema 变化后需要重启 Watch。外部修改 translations.json 或 overrides.json 时无需重新解析未变化源码。
- Provider 按缺失 locale 集合调度、去重、批处理并限制并发。Dev 不阻塞 transform；Build 在结束前等待当前可达模块需要的翻译。
- Provider 失败保留 null，并默认报告诊断；严格模式可将其升级为构建错误。

## 静态分析与开发体验

### 推荐语法与 ESLint

- 静态可提取与推荐写法是两个独立维度。Analyzer 尽量提取有限静态值；ESLint 负责报告动态参数、超出候选上限和不推荐的调用来源。
- ESLint 提供译文初始化快照、Runtime 状态快照和未订阅渲染诊断，帮助发现语言切换后不会刷新的值；这些规则只分析可可靠判断的当前文件直接调用，不承诺覆盖所有数据流。
- 可选的冗余自动导入规则只依据显式配置的当前自动导入集合判断，不读取或猜测 Vite 配置。
- Analyzer、ESLint 与 Vite 的开发者诊断使用同一语言策略。AI_I18N_DIAGNOSTIC_LOCALE 可固定为 zh-CN 或 en-US；auto 与未设置时按 Node 时区选择。

### 跨文件解析

- ESLint 默认从被检查文件向上查找最近的 tsconfig.json，解析 extends 与项目 references，并按 files、include、exclude 选择实际项目。
- TypeScript paths alias 属于 ESLint 的解析边界；只存在于 Vite resolve.alias 的别名必须同步到 tsconfig paths。
- Vite 继续使用自身的 resolve()，因此遵从最终 Vite alias、tsconfigPaths 与已注册 resolver plugin；ESLint 不加载或执行 Vite 配置。

## MCP 与 Agent 协作

- MCP 是本地 stdio 服务，不扫描 workspace、不执行 Vite 配置，也不在启动时接收项目路径。
- Agent 必须先确认目标 Vite 应用，再结合启动目录、Vite root 与 directory 计算最终绝对 i18n 目录。monorepo 中每个 Vite build 独立处理。
- MCP 的公开消息身份是 source 与可选静态 comment 组成的对象；内部编码后的 message ID
  不暴露给调用方，source_file 也不参与写入身份。
- 相同消息跨文件共享一份翻译。列表按消息聚合并返回完整 source_files；相同目标和值的批量
  重复输入只执行一次，同一目标的不同值必须失败，不能由工具猜测。
- 列表默认请求 100 条并允许提高到 500 条；响应大小保护只能减少完整记录数量，不能截断单条
  或破坏游标推进。
- MCP 只读取 extracted/ 以校验消息归属；翻译工具只修改 translations.json，人工工具只修改 overrides.json，不修改 extracted/ 或 locales/。
- 工具名、字段和稳定错误码使用英文；Agent 按用户语言解释结果。每次调用只返回一份紧凑 JSON 文本。
- Agent 的安全操作流程以 use-ai-i18n-mcp Skill 为准；Vite 接入流程以 integrate-ai-i18n Skill 为准。

## 进行中需求的文档生命周期

- 没有进行中需求时，不保留 TODO 文件。
- 新需求在 `docs/work/<feature-name>/` 下创建 `PRD.md` 与 `TODO.md`。PRD 只写待确认或待实现的目标、决策和边界；TODO 只保留未完成事项。
- 需求完成后，将仍然有效的长期决策合并到本文；删除对应工作目录、已完成 TODO 与验收快照。
- 总 PRD 与进行中需求 PRD 均不得超过 400 个物理行。达到 400 行时使用 file-line-audit Skill 审查；超过上限时按主题拆分，不得使用按序号切分的 part 文件。
- 总 PRD 的主题文件放在 `docs/prd/<topic>.md`，根 `docs/PRD.md` 保持索引与跨主题决策；进行中需求使用各自的 `prd/` 子目录。
- 产品行为、MCP 契约、Vite 配置方式或框架接入流程变化时，同时更新 apps/docs、相关包 README 与两份 Agent Skill。

## 非目标

- 远程 Translation Memory、Redis、SQLite、多租户或常驻服务。
- 让插件自动判断两个不同非空译文哪个更好。
- 通过全仓库扫描推断 Agent 的目标应用。
- 为历史未发布协议提供迁移或兼容分支。
