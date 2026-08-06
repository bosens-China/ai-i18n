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
- Alpha 阶段的内部发布依赖使用 `workspace:*` 并打包为精确版本，避免旧消费包自动漂移到
  新内部包。底层包变化通过 Release Please 生成配套消费包版本；正式稳定版只有在建立
  SemVer 向后兼容和最低依赖版本验证后才能恢复浮动范围。
- 基础 Vite 包保持框架中立。Vue 与 React 适配器按最终框架模式按需启用，不把框架运行时带入 Vanilla 项目。
- 浏览器源码提取仅支持 ESM。Vanilla 支持 `.js`、`.mjs`、`.ts`、`.mts`；Vue 与 React 额外支持 `.jsx`、`.tsx`，Vue 额外支持 `.vue`。`.cjs`、`.cts`、`require()` 与 `module.exports` 不在支持范围内；Vite 对配置文件和 CommonJS 依赖的兼容不会扩大插件的源码提取范围。
- 每个 Vite build 处理其入口可达的本地源码，包括 Vite root 外由 Vite 解析的 workspace 源码；协议中的 source 始终是相对当前 Vite root 的 POSIX 路径，不保存机器绝对路径。`node_modules` 中的预构建依赖不属于该范围。
- `extracted/` 物理文件名固定为标准化 source 的 SHA-256；JSON 内的 source 是查找权威，文件监听与 MCP 不从 hash 反推路径。
- Vue SFC 可以在 `<script>`、`<script setup>`、Options API 的 `computed` / `methods` 与 HTML template 中直接调用 `t()`；Pug 等预处理 template 暂不分析。开启自动导入时，Vite 分别向 script 词法作用域和 template 可见的 setup 作用域注入真实 binding，并生成独立的 Vue template 类型桥；纯 Options template 不需要 `methods: { t }`。关闭自动导入时，`<script setup>` 的显式 import 可直接供 template 使用，纯 Options template 仍通过 `methods: { t }` 暴露显式导入。组件已有同名 binding 继续优先，改名导入映射同样支持；`this.t`、`this.$t`、mixin 与 `globalProperties` 不属于 ai-i18n 支持的静态提取写法。
- 服务端渲染不在支持范围内。浏览器 Runtime 使用应用级状态，服务端共享会造成跨请求状态污染。
- 解析器采用 Yuku。它已经通过正确性、性能和跨平台准入；不把解析器选择暴露为公共配置，避免形成无收益的兼容面。

### 显式提取与消息标识

- 插件只提取显式的 t()、tagged template、Vue tRef()、Vue tComputed() 和受支持的静态文案树调用；不会猜测普通文本、JSXText 或业务属性是否需要翻译。
- 消息 ID 由 source 与可选的静态 comment 构成，不包含文件路径。相同语义可复用 Translation Memory；需要区分语义时必须传入 comment。
- 缺失译文保持 null，Runtime 回退 source 文案。Provider 与普通补译只补缺失字段，不能静默覆盖已提交译文。
- defineI18nMessages() 是编译期宏，用于成员级静态集合访问。整棵静态文案树直接传给 t()、Vue tRef() 或 Vue tComputed() 时不需要宏。

## Runtime 与框架

### 框架模式与自动导入

- 插件在 Vanilla、Vue、React 三种互斥模式中运行。默认由最终 Vite 插件列表推断，也允许显式覆盖；同时命中 Vue 与 React 时拒绝启动。
- 显式从 virtual:ai-i18n 导入的 API 始终可用。自动导入只减少 import 样板，不改变 Runtime 的导出边界。
- 三种模式都自动导入 t()、语言控制 API 与 subscribe()；Vue 额外自动导入 useI18n()、tRef()、i18nComputed() 与 tComputed()，React 额外自动导入 useI18n()。
- 自动导入按未绑定的值引用注入，覆盖直接调用、函数传递和对象简写；局部 binding、属性名、类型位置与赋值目标不能触发注入。
- Vue template 类型桥与主 dts 相邻生成；同名文件没有 ai-i18n 生成标记时拒绝覆盖。修改 dts 路径或关闭生成后无法可靠推断旧自定义路径，旧声明由用户显式删除，不扫描目录猜测。
- 主 dts 与 Vue template 类型桥使用统一的生成文件头，标记所有权并抑制宿主 TypeScript、ESLint、Prettier 与 Biome 对生成内容的检查或改写；声明正确性由生成器测试与框架类型检查保证。
- Vue 模式的顶层 t() 会读取 adapter revision，在 template、render 或 computed 的响应式执行路径中建立依赖；Options API 与 Composition API 均可直接使用。React 组件仍必须通过 useI18n() 订阅。普通模块中的 t() 不会自行创建响应式执行路径，应在实际需要文案时调用。
- getLang() 与 getLangLoadState() 返回调用时快照。ESLint 提示模块顶层缓存、Vue setup / Options data 保存和可确定的组件渲染读取；action、事件与普通函数可以按需读取，跨文件 store 数据流不做不可靠推断。

### 响应式翻译

- Vue 的 tRef() 是独立导出，不属于 useI18n() 返回值。它在 setup 或 composable 中创建只读 ComputedRef，支持字符串、tagged template 和静态文案树。
- 纯 Options 组件把 i18nComputed() 直接展开到根 computed，获得已解包的 currentLang、langs、langLoadState、isLangLoading 与 langLoadError；Vue setup、Options data / methods / render 与 template 不调用该配置工厂。组件级语言副作用使用原生 watch。
- tComputed() 直接作为 Options computed 属性值，输入能力与 tRef() 一致。t(messages) 返回当前语言的同形快照；tRef(messages) 和 tComputed(messages) 返回随 Runtime revision 更新的同形计算值。
- 不在模板、JSX 或渲染函数中调用 tRef() 或 tComputed()，避免重复创建 computed 或把 getter 当成译文；Options data 和模块变量也不保存 tComputed()。
- defineComponent() 与 strict/noImplicitThis 是纯 Options TypeScript 的推荐配置。Vue 自身不会按 watch key 推断回调参数，因此 TypeScript 示例显式标注 currentLang 的 next/previous 为 string，不新增组件包装器。
- React 适配器使用 useSyncExternalStore 订阅 Runtime revision，并在 revision 变化时更新 Hook 返回的 t() 引用，以兼容 React Compiler 的缓存语义。

### 语言加载

- 未配置 loading 时，所有语言随 Runtime 注册。配置 loading 后，目标语言按 locale 拆分为独立资源。
- getLangLoadState() 提供 idle、loading、error 的稳定快照；Vue 与 React 的 useI18n() 同时暴露加载状态、布尔值和错误，纯 Vue Options 通过 i18nComputed() 读取同一状态源。
- 并发切换采用 last-call-wins。过期请求的完成或失败不能覆盖最新目标语言的状态。

## 翻译与持久化

### 文件职责与最终值

- storage.json 声明当前 Translation Memory 驱动；默认的 translations/ 保存可审查分片 JSON，可选 SQLite 保存到用户级全局数据库；overrides.json 保存项目人工审校；extracted/ 保存插件生成的源码结构；locales/ 是派生运行时产物。
- 最终译文优先级固定为：comment 对应的人工值、同 source 的人工默认值、AI 翻译、source fallback。
- 人工审校必须写入 overrides.json，不污染 AI Translation Memory。空字符串是有效人工译文。
- JSON 模式提交源码、生成的类型声明、storage.json、translations/ 和 overrides.json；SQLite 模式只提交 storage.json 与 overrides.json，用户级数据库不提交。extracted/ 与 locales/ 可由 Build 重建，不提交。
- 一个 Vite build 独占一个协议目录。共享源码分别进入每个消费 build 的目录；多个 build 不能共用 directory，但 SQLite 可通过一个物理数据库中的逻辑项目绑定复用全局候选。

### Translation Memory 存储

- JSON 是默认驱动。消息按 message ID 的 SHA-256 前缀稳定分片，manifest 保存 revision 与有效分片；单次事务先写完整 journal，再提交分片与 manifest，进程中断后由 journal 恢复。
- Alpha 阶段将单文件 translations.json 自动迁移为分片 JSON，迁移后删除旧权威来源；首个非 prerelease 稳定版本不再保留该兼容层，也不保留其他未发布旧协议的长期兼容层。
- SQLite 使用平台用户数据目录中的单个全局数据库，并允许 AI_I18N_DATA_DIR 覆盖；项目目录只记录驱动，不记录数据库路径、源码绝对路径、Provider 配置或密钥。
- SQLite 项目身份由 realpath 后的 i18n 目录 hash 派生。候选身份包含 sourceLang、targetLang、source 与 comment；项目已有绑定优先，无绑定时只自动复用唯一候选，多个不同候选保持缺失。
- SQLite 是本机可丢弃缓存，不提供跨机器或团队同步。数据库丢失后由 Provider 重新生成，项目人工 overrides 不受影响。
- SQLite 引擎使用 better-sqlite3，并采用参数化固定查询、SQLite 事务、约束、索引和显式 user_version 迁移。当前四张内部缓存表不引入 ORM；出现复杂动态查询、多模块关系映射或大量 schema 迁移时优先重新评估 Drizzle。

### 并发与兼容性

- Vite 与 MCP 通过同一存储抽象读写。JSON 使用跨进程锁、锁内重读、字段级合并和可恢复原子提交；SQLite 使用同一外部锁与数据库事务。内存 ProjectState 只用于加速和 Runtime 更新，持久化存储才是写入真相。
- 同一 Vite Dev 插件实例内，ProjectState 更新、文件同步、重新 hydrate 与 HMR 通知组成串行状态事务；虚拟模块读取必须等待在先事务完成，避免旧异步结果覆盖或读到半提交状态。
- 不保留未发布旧 schema 或旧 MCP 工具参数的兼容层；只为已存在的单文件 Translation Memory 提供一次自动迁移。
- sourceLang 变更时，当前实现会在 comment 一致且历史候选唯一时尽力复用历史翻译；候选不唯一时保持缺失，不猜测。这是保守兼容行为，不构成公开的稳定迁移承诺。
- Translation Memory 的容量限制与 orphan 清理只淘汰非活动历史消息，不能为满足上限而破坏当前源码仍引用的译文。

### Vite 生命周期与 Provider

- Dev 渐进处理浏览器实际请求到的模块；Build 以入口可达模块图进行完整处理；Build Watch 复用未变化的分析结果并在必要时校准活动集合。
- Vite 配置、提取规则或 schema 变化后需要重启 Watch。外部修改当前 Translation Memory 或 overrides.json 时无需重新解析未变化源码。
- Provider 按缺失 locale 集合调度、去重、批处理并限制并发。Dev 不阻塞 transform；Build 在结束前等待当前可达模块需要的翻译。
- 缺失译文的 Provider 请求失败时保留 null；`fresh` 刷新失败时保留已有历史值。默认报告诊断，严格模式可将失败升级为构建错误。
- Provider 缓存策略不区分 Dev 与 Build。默认 `reuse`；`fresh` 让当前 Vite 进程向 Provider 刷新一次已有自动译文，并立即复用本进程的新结果。历史值仍可供 Runtime 使用，JSON、SQLite 与 MCP 不改变读取和共享语义。
- Provider、模型、`baseURL`、温度和提示词不自动参与缓存指纹。任意 Translator 无法被可靠、安全地序列化；需要重跑时由用户显式设置 `provider.cache: 'fresh'`，人工 overrides 始终保留。
- 同一消息与 locale 在一个进程中只发起一次普通翻译尝试；并发请求由 Provider Coordinator 合并，失败或空结果不会因普通 HMR 无限重试，源码身份变化或重启进程后可重新尝试。

## 静态分析与开发体验

### 推荐语法与 ESLint

- 静态可提取与推荐写法是两个独立维度。Analyzer 尽量提取有限静态值；ESLint 负责报告动态参数、超出候选上限和不推荐的调用来源。
- ESLint 提供译文初始化快照、Runtime 状态快照和未订阅渲染诊断，识别 Options data 与 setup 的初始化边界、tComputed() / i18nComputed() 的合法 computed 位置、自动导入的裸 `t` 与关闭自动导入时纯 Options 的显式 `methods: { t }` bridge，并报告把 `this.t` / `this.$t` 当作 ai-i18n API 的写法；这些规则只分析可可靠判断的当前文件直接调用，不承诺覆盖所有数据流。
- 可选的冗余自动导入规则只依据显式配置的当前自动导入集合判断，不读取或猜测 Vite 配置。
- Analyzer、ESLint 与 Vite 的开发者诊断使用同一语言策略。AI_I18N_DIAGNOSTIC_LOCALE 可固定为 zh-CN 或 en-US；auto 与未设置时按 Node 时区选择。

### 跨文件解析

- ESLint 的显式 `settings['ai-i18n'].alias` 拥有最高优先级。未命中显式 alias 时，从被检查文件向上查找最近的 `tsconfig.json` 或 `jsconfig.json`；同一目录同时存在两者时优先使用 `tsconfig.json`。项目配置继续解析 `extends` 与 references，并按 `files`、`include`、`exclude` 选择实际项目。
- 显式 alias 面向 Vite 与 ESLint 共享的本地源码别名，replacement 必须是绝对路径。第一版只承诺字符串到字符串的对象形式，不模拟正则 alias、`customResolver` 或 resolver plugin。
- Vite 继续使用自身的 resolve()，因此遵从最终 Vite alias、tsconfigPaths 与已注册 resolver plugin；ESLint 不加载或执行 Vite 配置。
- ai-i18n 在 Vite `pre` 阶段分析源码；同阶段更早的插件仍可能先改写合法的 `t()`。排障先确认模块可达和翻译归属，再临时禁用或调整同阶段插件顺序。由其他构建期宏自行翻译的字段保持宏要求的静态字面量，不为重复的 `t()` 新增宏白名单、ESLint 豁免或强制排序。

## MCP 与 Agent 协作

- MCP 是本地 stdio 服务，不扫描 workspace、不执行 Vite 配置，也不在启动时接收项目路径。
- 面向应用开发者的接入文档覆盖 Codex、Cursor、Claude Code 和 Antigravity。仅对官方提供命令注册的
  客户端给出一键命令；未收录到客户端 MCP Store 的本地 stdio 服务继续使用该客户端的配置文件。
- Agent 必须先确认目标 Vite 应用，再结合启动目录、Vite root 与 directory 计算最终绝对 i18n 目录。monorepo 中每个 Vite build 独立处理。
- MCP 读取目标 build 的完整 extracted 集合，因此同一目录同时包含应用源码和它实际消费的本地 workspace 源码；纯源码子包不是独立 MCP 目标。
- MCP 的公开消息身份是 source 与可选静态 comment 组成的对象；内部编码后的 message ID
  不暴露给调用方，source_file 也不参与写入身份。
- 相同消息跨文件共享一份翻译。列表按消息聚合，默认省略 source_files 与 occurrence；显式请求时
  可返回完整共享文件范围，或返回每个文件与完整行列位置。路径与位置只用于读取附近源码语境，
  MCP 不读取源码片段，也不把上下文加入写入身份。相同目标和值的批量重复输入只执行一次，同一目标的不同值必须失败，不能由工具猜测。
- 自动译文与人工覆盖写入都必须在修改存储前校验模板 token。缺失、多出、改变编号或重复次数
  不一致时整批失败，并返回期望、实际、缺失与多余 token，供 Agent 修正后重试。
- 批量参数中重复出现的同一个未知字段合并为一条校验错误，并返回出现次数、首次位置、合法字段和
  修改动作。MCP 业务错误除稳定错误码和上下文外，始终返回 Agent 可直接执行的 next_action。
- 孤立 Translation Memory 使用独立的只读列表与破坏性删除工具。普通补译、审校和验证不得自动
  进入该流程；用户明确要求后，Agent 先完成完整 Build 和全量审查，再取得删除授权。删除只接受
  列表返回的 opaque ID，在写入前整批复验消息仍未被源码引用，并且不联动删除人工 overrides。
- 列表默认请求 100 条并允许提高到 500 条；响应大小保护只能减少完整记录数量，不能截断单条
  或破坏游标推进。
- MCP 只读取 extracted/ 以校验消息归属；翻译工具按 storage.json 修改分片 JSON 或 SQLite Translation Memory，人工工具只修改 overrides.json，不修改 extracted/ 或 locales/，也不执行 Vite 配置。
- MCP 不读取 `provider.cache`。Vite 的进程级 Provider 刷新不能过滤、阻止或覆盖在途 Agent 写入。
- 工具名、字段和稳定错误码使用英文；Agent 按用户语言解释结果。每次调用只返回一份紧凑 JSON 文本。
- Agent 的安全操作流程以 use-ai-i18n-mcp Skill 为准；Vite 接入流程以 integrate-ai-i18n Skill 为准。

## 进行中需求的文档生命周期

- 没有进行中需求时，不保留 TODO 文件。
- 新需求在 `docs/work/<feature-name>/` 下创建 `PRD.md` 与 `TODO.md`。PRD 只写待确认或待实现的目标、决策和边界；TODO 只保留未完成事项。
- 需求完成后，将仍然有效的长期决策合并到本文；删除对应工作目录、已完成 TODO 与验收快照。
- 总 PRD 与进行中需求 PRD 均不得超过 400 个物理行。达到 400 行时使用 file-line-audit Skill 审查；超过上限时按主题拆分，不得使用按序号切分的 part 文件。
- 总 PRD 的主题文件放在 `docs/prd/<topic>.md`，根 `docs/PRD.md` 保持索引与跨主题决策；进行中需求使用各自的 `prd/` 子目录。
- 产品行为、MCP 契约、Vite 配置方式或框架接入流程变化时，同时更新 apps/docs、相关包 README 与两份 Agent Skill。

## 发布可靠性

- Turbo 只负责 workspace 构建、检查与测试的依赖顺序和缓存；Release Please 继续负责版本、
  变更日志与 GitHub Release，npm Trusted Publishing 继续负责最终上传。
- 发布候选验证只处理 npm 上尚不存在的当前包版本，在空 workspace 中安装同批 tarball，
  其余内部依赖从真实 registry 解析，并实际导入公开入口。这样本地 workspace 不能掩盖已发布
  依赖缺少 exports 或产物的错误。
- 最终 tarball 必须使用精确内部版本、包含 package.json 声明的全部文件入口，并按内部依赖
  拓扑上传。发布包的公共入口、运行行为或依赖契约变化使用 `fix` / `feat` 提交；`refactor`
  不承载需要发版的变化。

## 非目标

- 远程 Translation Memory、Redis、多租户或常驻服务。
- 让插件自动判断两个不同非空译文哪个更好。
- 通过全仓库扫描推断 Agent 的目标应用。
- 为历史未发布协议提供迁移或兼容分支。
