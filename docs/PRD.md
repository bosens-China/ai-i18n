# ai-i18n 现行产品决策

> 状态：现行。本文记录已经确认且仍然有效的产品决策、设计原因与边界，不替代用户 API 文档、包 README 或源码类型。

## 文档边界

- 用户可见的 API、配置和接入流程以 apps/docs 为准。
- 公开 TypeScript 类型与 API 参考当前继续手写维护；Zod Schema 只负责运行时校验，不作为文档生成来源。
- Rspress 发布 `llms.txt` 精简索引与 `llms-full.txt` 完整正文。Agent 默认先读取
  `llms.txt`，再按任务读取具体用户页面；不默认加载完整正文。
- 包级安装、运行与开发者配置以各 packages/*/README.md 为准。
- MCP 的公开工具契约以 packages/mcp/README.md 与源码 schema 为准。
- 对外 Skill 不复制用户教程，只保留 Agent 的目标选择、默认决策、工具契约、授权与写入边界、
  验证和错误恢复；具体产品用法通过 `llms.txt` 路由到 apps/docs。
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
- `extracted/` 物理文件名固定为标准化 source 的 SHA-256；JSON 内的 source 是查找权威，文件监听与 MCP 不从 hash 反推路径。完整 Build 以全量 snapshot 清理旧版本遗留的非规范物理文件并重新生成当前格式，Dev 增量流程不据此扩大删除范围。
- Vue SFC 可以在 `<script>`、`<script setup>`、Options API 的 `computed` / `methods` 与 HTML template 中直接调用 `t()`；Pug 等预处理 template 暂不分析。开启自动导入时，Vite 分别向 script 词法作用域和 template 可见的 setup 作用域注入真实 binding，并生成独立的 Vue template 类型桥；纯 Options template 不需要 `methods: { t }`。关闭自动导入时，`<script setup>` 的显式 import 可直接供 template 使用，纯 Options template 仍通过 `methods: { t }` 暴露显式导入。组件已有同名 binding 继续优先，改名导入映射同样支持；`this.t`、`this.$t`、mixin 与 `globalProperties` 不属于 ai-i18n 支持的静态提取写法。
- 服务端渲染不在支持范围内。浏览器 Runtime 使用应用级状态，服务端共享会造成跨请求状态污染。
- 解析器采用 Yuku。它已经通过正确性、性能和跨平台准入；不把解析器选择暴露为公共配置，避免形成无收益的兼容面。

### 显式提取与消息标识

- 插件只提取显式的 t()、tagged template、Vue tRef()、Vue tComputed() 和受支持的静态文案树调用；不会猜测普通文本、JSXText 或业务属性是否需要翻译。
- 标注为 `I18nRuntime['t']` 的函数参数或局部函数值不属于可提取 Runtime binding；Analyzer、Vite 与 ESLint 对其直接调用发出中英文诊断，引导开发者直接使用 `virtual:ai-i18n` 导入或 `useI18n()` 返回的 `t`。普通同名函数不据此报警，也不根据 TypeScript 类型追踪运行时实参来源。
- 消息 ID 由 source 与可选的静态 comment 构成，不包含文件路径。相同语义可复用 Translation Memory；需要区分语义时必须传入 comment。
- 缺失译文保持 null，Runtime 回退 source 文案。Provider 与普通补译只补缺失字段，不能静默覆盖已提交译文。
- defineI18nMessages() 是编译期宏，用于成员级静态集合访问；转换只移除宏调用，参数对象或数组作为运行时值保留，宏函数本身不能被引用、传递或保存。整棵静态文案树直接传给 t()、Vue tRef() 或 Vue tComputed() 时不需要宏。
- 数据库、接口与业务判断保存稳定语义 code；有限业务枚举通过静态文案映射在展示层翻译，不把译文作为持久值或业务身份。

## Runtime 与框架

### 框架模式与自动导入

- 插件在 Vanilla、Vue、React 三种互斥模式中运行。默认由最终 Vite 插件列表推断，也允许显式覆盖；同时命中 Vue 与 React 时拒绝启动。
- 显式 framework 只接受 vanilla、vue、react；JavaScript 配置同样在启动时校验，不能依赖 TypeScript 才发现无效值。
- 显式从 virtual:ai-i18n 导入的 API 始终可用。自动导入只减少 import 样板，不改变 Runtime 的导出边界。
- 三种模式都自动导入 t()、语言控制 API 与 subscribe()；Vue 额外自动导入 useI18n()、tRef()、i18nComputed() 与 tComputed()，React 额外自动导入 useI18n()。
- 自动导入按未绑定的值引用注入，覆盖直接调用、函数传递和对象简写；局部 binding、属性名、类型位置与赋值目标不能触发注入。
- Vue template 类型桥与主 dts 相邻生成；同名文件没有 ai-i18n 生成标记时拒绝覆盖。修改 dts 路径或关闭生成后无法可靠推断旧自定义路径，旧声明由用户显式删除，不扫描目录猜测。
- 主 dts 与 Vue template 类型桥使用统一的生成文件头，标记所有权并抑制宿主 TypeScript、ESLint、Prettier 与 Biome 对生成内容的检查或改写；声明正确性由生成器测试与框架类型检查保证。
- Vue 模式的顶层 t() 会读取 adapter revision，在 template、render 或 computed 的响应式执行路径中建立依赖；Options API 与 Composition API 均可直接使用。React 组件仍必须通过 useI18n() 订阅。普通模块中的 t() 不会自行创建响应式执行路径，应在实际需要文案时调用。
- getLang() 与 getLangLoadState() 返回调用时快照。ESLint 提示模块顶层缓存、Vue setup / Options data 保存和可确定的组件渲染读取；action、事件与普通函数可以按需读取，跨文件 store 数据流不做不可靠推断。
- Vitest 使用独立的内存 Runtime 与转换插件，不读取或修改项目翻译文件；`t()` 对数组和普通对象保持同形结构，字符串叶子回退 source。测试环境误用生产插件而进入 SSR 降级时，双语 warning 必须指向专用 Vitest 入口，不能静默掩盖配置错误。应用不得用 alias 或 `vi.mock('virtual:ai-i18n')` 覆盖专用 Runtime；文案树退化为字符串时先排查测试 setup。

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

- `translations/` 与 `overrides/` 是项目译文的唯一权威来源；`extracted/` 保存插件生成的
  源码结构，`locales/` 是派生运行时产物。项目不存在 JSON/SQLite 存储模式或存储标记。
- `translations/` 与 `overrides/` 都按目标语言和稳定身份使用 `<locale>/<0-f>.json` 固定哈希桶，
  每种语言最多 16 个非空分片，不保存集中 manifest 或单一聚合 JSON。桶内以完整 SHA-256 身份为键，
  分别保存自动译文目标或带作用范围的人工决定，并按键确定性排序。
- 人工覆盖以 `source`、可选静态 `comment`、目标语言和一种作用范围表达。范围只能是
  当前 Vite 应用全局、精确源码文件，或相对 Vite root 的标准化 POSIX 文件路径加 1-based
  行号与 0-based 列号组成的精确出现位置；不支持绝对路径、路径片段或 glob。
- 最终译文优先级固定为：出现位置 + comment、出现位置默认、文件 + comment、文件默认、全局 +
  comment、全局默认、AI Translation Memory、source fallback；更精确范围始终覆盖较宽范围。
- 人工校对必须写入 `overrides/`，不污染项目自动译文或个人候选缓存。空字符串是有效人工译文；
  comment 与文件范围彼此独立且可以组合。
- Translation Memory 继续以 `source + comment` 跨文件复用；Runtime 与派生 locale 使用
  `source file + message ID + occurrence` 区分同一语义消息在不同文件、同一行不同列的最终人工值。该运行时身份不改变公开
  `t()` 调用、Translation Memory 身份或 MCP 的消息对象。Vite 注入 occurrence 运行时身份时必须保持
  JavaScript、JSX 和 Vue 模板等宿主源码语法合法，包括使用单引号或双引号包裹的 Vue 属性绑定。
- 提交源码、生成的类型声明、`translations/` 和 `overrides/`；`extracted/` 与 `locales/`
  可由 Build 重建，个人 SQLite 数据库也不提交。
- 一个 Vite build 独占一个协议目录。共享源码分别进入每个消费 build 的目录；多个 build
  不能共用 directory，可选个人缓存可跨项目提供候选，但不改变任何项目的目录格式。

### Translation Memory 存储

- Core 通过受控目录扫描将自动译文和人工覆盖聚合为规范化内存对象；UI、MCP 和其他
  消费方按需把它序列化为整理好的 JSON，但不把聚合结果持久化为第二份项目事实。
- 分片身份和路径由内容确定，内存 revision 也由当前内容稳定派生，不依赖集中计数器。
  单次事务先写完整 journal，再原子提交变化分片；进程中断后由 journal 恢复。
- 自动译文分桶固定以 `version`、`locale`、`entries` 写入顶层字段；条目固定以 `id`、`source`、
  `sourceLang`、可选 `comment`、`value` 写入，动态哈希键按固定码元排序。协议字段不使用字典序重排，
  避免一次 MCP、Provider 或 Vite 写入产生无关 Git diff。
- `@ai-i18n/sqlite` 只提供可选个人 Translation Memory 候选缓存，通过
  `translationMemory.cache: sqlite()` 启用。SQLite 和 `better-sqlite3` 不进入 Core、MCP 或默认项目路径。
- 缓存按 sourceLang、targetLang、source 与 comment 查询。只有去重后恰好一个候选时才自动
  复用；无候选或多候选保持缺失，交给 Provider 或人工处理，不按时间自动选优。
- 缓存命中的值必须先写入项目 `translations/` 才能使用；Provider 结果也先提交项目 JSON，
  再回填缓存。缓存故障或删除只能降低复用率，不能改变已提交的译文、构建产物或 Runtime 行为。
- SQLite 使用平台用户数据目录中的单个数据库，允许 `AI_I18N_DATA_DIR` 覆盖。引擎使用
  better-sqlite3，当前只需候选表、参数化固定查询、SQLite 事务、约束与索引，不引入 ORM。

### 并发与兼容性

- Vite、MCP 与 Review 通过同一项目存储抽象读写。自动译文和人工覆盖各自使用跨进程锁、
  锁内重读和可恢复原子提交。内存 ProjectState 只用于加速和 Runtime 更新，项目分片才是写入真相。
- 不同哈希桶使用不同路径；同一桶内的不同目标使用完整哈希键，Git 冲突时按键保留双方独立修改；
  同一键同时修改时暴露真实语义冲突并由人选择。不按用户名拆权威文件，不用客户端时间或文件修改
  时间自动决定赢家。
- 同一 Vite Dev 插件实例内，ProjectState 更新、重新 hydrate 与 HMR 通知继续由状态事务排序；普通
  source transform 只登记变化源码，协议写入由单实例调度器用短 debounce 与 max-wait 串行执行，
  在真正写入前生成一次最新快照，不阻塞转换响应。普通 Dev 批次只更新变化源码对应的 extracted 与
  locale 消息并保留未访问模块；依赖全量活动集合的 orphan/capacity 清理由完整同步校准。外部协议
  文件变更、Provider 结果、人工校对和关闭生命周期先 flush 待写快照；浏览器模块注册直接读取已排序的
  ProjectState，避免旧异步结果覆盖或为普通后台写入重复扫描目录。
- 产品尚未发布正式版，不保留旧单文件、旧 manifest、存储标记、SQLite 项目绑定或旧 MCP
  工具参数的读取和迁移兼容。
- sourceLang 变更时，当前实现会在 comment 一致且历史候选唯一时尽力复用历史翻译；候选不唯一时保持缺失，不猜测。这是保守兼容行为，不构成公开的稳定迁移承诺。
- Translation Memory 的容量限制与 orphan 清理只淘汰非活动历史消息，不能为满足上限而破坏当前源码仍引用的译文。
- 容量限制属于 translationMemory.capacity，按当前项目的逻辑 Translation Memory 快照计算；provider.cache 只控制当前 Vite 进程的自动译文刷新，两者不能混用。

### Vite 生命周期与 Provider

- Dev 渐进处理浏览器实际请求到的模块；Build 以入口可达模块图进行完整处理；Build Watch 复用未变化的分析结果并在必要时校准活动集合。
- Dev 模块消息随原业务模块同步注册到共享 Runtime，不再请求每源码注册虚拟模块；普通自动导入与
  普通静态命名的显式 `virtual:ai-i18n` import 都从共享 Runtime 创建文件 scope。Vue 编译期宏引用的
  binding、namespace、动态 import、直接 re-export、纯副作用和混合 type/未知导出的 import 保留模块级
  scoped 兼容路径。Build 与 Build Watch 继续使用原有静态注册链路，虚拟 scope/registration 模块必须
  合并进业务 chunk，不能成为独立 facade 或逐源码浏览器请求。MCP、Provider 和校对写入后，由 Dev
  独立观察 i18n 目录与 Translation Memory
  文件并通过 HMR 更新已激活模块；完整 Build 仍是 MCP 首次使用和 orphan 审计的全量依据。
- Dev 管理文件的 create/update 事件允许读取内容并识别插件自身写入；delete 事件不得读取已经消失的
  文件。活动生成文件被外部删除时按当前内存状态恢复，已失效文件不得复活或触发 HMR 自激循环。
- `diagnostics.timing` 是默认关闭的 Vite Dev 慢阶段诊断。`true` 使用 50ms 阈值，也可配置非负有限的
  `minDurationMs`；除 source-transform 和 file-sync 总阶段外，报告初始化等待、
  分析、注册、依赖解析、状态事务、快照、extracted 扫描/写入、Translation Memory 和 locale 写入
  子阶段。阶段允许嵌套，不能直接相加；日志遵循中英文诊断策略，不输出源码正文、译文、绝对机器路径
  或凭据，也不进入 Build 或项目文件。Vite 控制台只按信息、警告和错误语义突出 ai-i18n 前缀；
  耗时诊断额外突出阶段与耗时并弱化模块路径，正文保持默认颜色。终端不支持颜色时保留相同纯文本，
  不增加公共配色配置或改变 Vite Logger 的日志等级。
- `dependency-resolution` 包含 Vite `resolve()`、尚未分析本地依赖的 Dev Environment 完整转换或
  Build `load()` 等待，可能覆盖子模块的嵌套转换。Dev 必须在 importer 首次返回前完成依赖分析并刷新
  当前注册，避免合法跨文件静态值只更新内存状态却留下缓存的错误产物。不能把整段耗时视为插件自身的
  解析 CPU；只有多个真实大型项目证明它稳定处于用户可见关键路径，且能与子模块加载分离归因时才重新评估。
- Vite Dev 配置阶段把 `@ai-i18n/vite/runtime`、`@ai-i18n/vite/vue` 与 `@ai-i18n/vite/react`
  合并进 `optimizeDeps.exclude`，保留应用已有的 include/exclude。插件运行时入口不参与预构建，避免首次
  动态路由访问才被 Vite 发现并触发整页重载；应用其他依赖的按需优化仍由应用和 Vite 自己管理。
- 显式注册 Review 时，`@ai-i18n/vite/review/runtime` 同样加入 `optimizeDeps.exclude`，避免首次打开
  懒加载工作台时触发依赖优化重载。
- Review 由 `@ai-i18n/vite/review` 的 `aiI18nReview()` 独立注册，不再属于 `aiI18n()` 默认行为或
  `review` 选项。未注册时核心插件不注入入口、不挂载 Review API、不提供 Review 虚拟模块；Review
  插件只在 `serve` 生效，不进入 Build、Preview、SSR 或生产产物。注册后固定提供 `/__ai-i18n/` 独立
  页面与同源 API，并默认注入业务页右下角入口、在 Dev Server 监听后打印一次完整地址。`launcher: false`
  只停止注入业务页客户端，`printUrl: false` 只关闭控制台提示，二者均不关闭独立页面或 API。
- Review 宿主使用 Web Component 与开放 Shadow DOM。入口壳随页面注入，完整工作台 JS 与编译后的
  UnoCSS 在首次打开时才加载到 Shadow Root；不使用 iframe 或 postMessage，也不把 reset 或工作台
  样式注入业务 `document.head`。内部 UI 可以使用私有 Vue workspace，但业务应用无需 Vue 或 UI 依赖。
  页面内工作台作为连续实体区域直接贴住视口底边，不保留悬浮式底部空隙；只把用户拖拽调整的面板高度
  作为浏览器本地 UI 偏好保存，不进入项目配置。
- 嵌入工作台默认按当前业务 DOM 中实际渲染的文本与可翻译属性匹配原文、自动译文和人工译文，不按
  已加载模块推断 SPA 当前页；用户可以显式切换到全部已提取文案。运行时插值按占位符模板匹配。“页面取词”
  静态 HTML 时由 bridge 的内部 occurrence 元数据直接得到文件、行、列；Vue、React 或普通运行时
  字符串无法唯一映射时，左侧进入可返回的定位结果层级，按文件和 occurrence 展示全部候选。在用户
  选择位置前不得保存点选修订或静默采用第一项，退出定位层级后恢复此前的浏览范围。悬停时按指针实时
  命中的业务 DOM 显示带角点的定位框，点击后重新打开工作台并短暂保留反馈，再自动清除。
- 独立 Review 页面与嵌入工作台共享核心校对组件、主题、快照和写入 API，但采用适合完整桌面视口的
  独立信息架构：产品头部表达任务与进度，目标语言、搜索、状态和文件类型使用横向工具条，主区域使用
  “校对队列 + 专注编辑”双栏布局。筛选、队列和编辑器作为同一个最大约 1600 px 的内容组居中，超宽
  空间对称留在页面两侧，不单独居中编辑器；以 1280×720 作为最小桌面验收尺寸，队列保持可读宽度，
  编辑区使用剩余空间并与队列上下对齐。独立页默认进入全部文案；由于没有业务 DOM 上下文，不展示
  当前页面范围、页面取词或业务页面滚动定位。独立地址固定，不增加自定义路径配置；浏览器标签使用
  随 Review 插件提供的产品图标，不继承业务项目图标，也不依赖在线资源。
- 校对 UI 支持深色、浅色和跟随系统三种外观，以及跟随浏览器、中文、English 三种界面语言；用户通过
  工作台设置切换，偏好保存在浏览器本地，外层入口壳与内层 Shadow DOM 工作台同步应用，不进入项目配置。
- 校对 UI 的界面文案使用随包内置、类型安全的本地静态消息目录；外层入口壳与内层
  工作台共用同一权威目录，计数和无障碍文案使用带参数的完整消息。该目录不依赖宿主
  `virtual:ai-i18n` Runtime，不在构建或运行时触发 Provider，确保翻译系统异常时 Review 仍可独立排障。
- 校对 UI 不依赖在线或未随包提供的 Web Font；外层入口壳与内层工作台统一使用操作系统无衬线字体，
  并显式回退到苹方、微软雅黑、Noto Sans CJK SC 与思源黑体。中文语义标签使用无衬线字体，等宽字体只用于
  路径、Token、语言代码、计数和快捷键；界面字重使用稳定的 600/700 档位，紧凑路径辅助文字不小于 10 px。
- 校对页面首次读取时只读既有 `extracted/` 与 Translation Memory 快照作为初始列表，不扫描源码、
  不触发 Provider，也不写入业务 Runtime 状态；Dev 实际转换的模块始终优先，且会遮蔽同源旧记录。没有
  既有快照时，列表只随当前 Dev 已访问模块渐进增长。校对操作按全局、精确文件或精确出现位置范围原子更新
  `overrides/` 中对应分桶的条目并触发 HMR，不注册到 Build、Build Watch、Preview 或生产产物。
- 校对 UI 在发布包中由 Vite 插件携带预构建静态资源，与业务应用的框架和 UI 依赖隔离；仓库本地
  Dev 会自动把私有 review-ui workspace 挂到业务 Vite Server，并通过独立 HMR 通道刷新源码改动，
  无需先构建或复制。内部 UI workspace 包保持私有，不作为面向应用开发者的安装入口。
- 校对插件面向笔记本和桌面浏览器，采用左侧虚拟化消息列表和右侧编辑工作台；工作台采用紧凑
  DevTools 布局并固定在业务页面底部，不提供右侧停靠或全屏模式；用户可以拖动面板上边缘调整高度，
  高度偏好只保存在当前浏览器。手机布局不作为产品验收目标。业务页入口与外层标题栏使用产品标识；
  外层标题栏与工作台主 Tab 使用连续实体背景，带 Header 的校对详情再通过背景和边界保持清晰层级。
  嵌入工作台的“全部页面”在宽屏使用筛选、列表、编辑三段式；紧凑和上下布局中的筛选项单行横向滚动，
  不挤压消息列表。独立页从常见笔记本到大屏均优先使用横向筛选工具条与队列 / 编辑双栏，只有明显窄于
  桌面验收尺寸的窗口才退化为上下布局。
  目标语言只有一个时不显示选择器；存在多个目标语言时，嵌入式“全部页面”的语言轨道位于筛选区最左侧，
  “当前页面”的语言轨道位于文案列表最左侧，独立页则把语言放在横向工具条最左侧。左侧搜索原文、自动译文、人工译文、comment 与源码路径，
  并可按当前提取结果实际包含的末级文件扩展名叠加筛选；同一文案任一来源文件匹配即可保留。每条普通文案在
  状态与译文预览下以强调标签显示第一个可用的相对源码路径与行列，右侧图标可安全跳转到当前 Vite root 内的
  VS Code 文件。选中详情不重复显示原文、comment、源码位置或编辑器入口，只负责自动译文、人工译文和
  作用范围。同一文案存在多个位置时，精确选择继续进入页面取词定位层级，不在普通列表静默切换作用范围。
  点击列表中属于当前 DOM 的文案时，业务页面滚动到固定面板上方的第一个可见匹配元素并短暂显示定位框；
  不属于当前 DOM 的文案只更新工作台选中项。列表悬停、选中与选中后悬停使用低透明度蓝色层级和约
  180 ms 过渡，减少动态效果时关闭过渡。
  静默快照刷新不得改变用户的列表滚动位置；只有选中消息真实
  变化或容器尺寸变化时才自动滚动以保持选中项可见，列表末尾必须稳定停留并显示最后一条文案。
- 语言、状态与作用范围使用同一紧凑分段控件规格，保持 28 px 高和 12 px 字号；作用范围按内容紧凑
  等宽排列，不横向铺满编辑区。保存、继续和撤销使用统一的 32 px 动作按钮规格，主次关系由颜色表达。
- 搜索框和人工译文框使用一致的柔和焦点反馈：边框、背景和低透明度微光在约 200 ms 内渐变，不通过
  缩放或位移改变布局；系统启用减少动态效果时关闭过渡，同时保留清晰的静态焦点状态。
- 未保存输入在当前页面会话内按消息、目标语言和作用范围隔离，切换筛选、搜索、语言或范围不会
  丢失；关闭或刷新页面不承诺保留。作用范围固定为“当前位置”“当前文件”和“所有文件”三个 Tabs；
  当前文件取自当前选中的出现位置。源码移动后旧位置规则不自动猜测或迁移，而作为 orphan 等待审查。
- 无当前人工覆盖时，人工输入框默认留空；自动译文只作为可显式填入的参考。仅非空且模板 Token
  有效的人工输入可以确认；已有人工覆盖按“保存修改”和“已保存”区分。支持 `Command/Ctrl + Enter`
  保存、`Command/Ctrl + Shift + Enter` 保存并继续、`Alt + A` 填入自动译文，以及在非文本输入焦点下
  使用上下方向键切换文案；虚拟列表必须让键盘选中的文案保持可见。
- 已打开的校对页在可见时自动获取最新快照，Dev 新访问或重新转换的模块无需手动刷新即可替换对应的
  Build 初始记录；自动刷新不触发 Provider、不覆盖未保存输入，也不改变当前筛选、语言、范围和选择。
- 校对页面不引入账号或 token。写接口只接受同源、`application/json` 请求并复用 overrides 的消息、
  locale、文件归属和模板 token 校验；跨机器协作与远程暴露不属于该本地能力。
- Vite 配置、提取规则或 schema 变化后需要重启 Watch。外部修改当前 `translations/` 或
  `overrides/` 分片时无需重新解析未变化源码。
- Provider 按缺失 locale 集合调度、去重、批处理并限制并发。Dev 不阻塞 transform；Build 在结束前等待当前可达模块需要的翻译。
- 缺失译文的 Provider 请求失败时保留 null；`fresh` 刷新失败时保留已有历史值。默认报告诊断，严格模式可将失败升级为构建错误。
- Provider 缓存策略不区分 Dev 与 Build。默认 `reuse`；`fresh` 让当前 Vite 进程向 Provider
  刷新一次已有自动译文，并立即复用本进程的新结果。历史值仍可供 Runtime 使用；该进程策略不改变
  项目 JSON、个人候选缓存或 MCP 的读写边界。
- Provider、模型、`baseURL`、温度和提示词不自动参与缓存指纹。任意 Translator 无法被可靠、安全地序列化；需要重跑时由用户显式设置 `provider.cache: 'fresh'`，人工 overrides 始终保留。
- 同一消息与 locale 在一个进程中只发起一次普通翻译尝试；并发请求由 Provider Coordinator 合并，失败或空结果不会因普通 HMR 无限重试，源码身份变化或重启进程后可重新尝试。
- LLM 审查日志默认关闭并只由 Vite 的 `provider.logging` 配置。`true` 使用 Vite root 下的 `logs/`；字符串表示相对 Vite root 或绝对日志目录，空字符串无效。Vite 把解析后的关闭状态或绝对目录传给 Translator 和生命周期事件；一个 OpenAI Translator 实例在每个目录对应一个文件，Dev/HMR 与 Build Watch 持续追加，独立 Build 创建新文件。
- 实现 reportBatchEvent 的 Translator 始终接收 scheduled、state-applied、persisted、failed 事件；事件按 stage 使用判别联合类型并始终携带规范化 logging。关闭日志只禁止写入日志文件，不禁止事件派发。
- OpenAI 审查日志完整保留实际 messages、每个 choice 的 assistant message、思考、回复、usage、重试、错误和校验结果，过滤未设置参数、SDK runtime 字段与常规传输 Header；未知 message 扩展字段不能因格式化丢失。
- OpenAI Provider 直接使用 Zod 4 统一解析配置、批次输入和安全错误状态；按目标 locale 与批次长度生成的动态 Zod Schema 同时交给 LangChain structured output 并校验响应，不能再并行维护手写 JSON Schema 与对象结构判断。占位符一致性等跨 source/translation 的业务不变量保留专用校验；SDK 日志格式化为兼容未知扩展字段保持宽松读取。
- OpenAI Provider 的公开提示词配置只保留 `style`，用于领域、语气、长度、大小写、术语与保留词偏好；
  `systemPrompt` 不再接受。翻译职责、comment 语义、不可改内容、模板占位符、目标语言、输入输出行映射
  与 JSON 结构全部由 Provider 固定维护。模型 user message 仍只包含当前 Coordinator 调度的缺失消息
  JSON 批次，style 变化不自动成为 Translation Memory 缓存指纹。
- OpenAI 日志必须脱敏显式 API key 与常见认证 Header。日志可能包含业务文案与模型输出，仓库和接入文档必须忽略 `logs/`、`*.log` 与自定义日志目录；日志写入失败或追踪接收器异常不能改变翻译、提取、缓存或 Build 结果。
- Vite 为每次实际 Translator 批次分配诊断 `batchId`；OpenAI 日志用同一 ID 串联调度、REQUEST、RESPONSE、VALIDATION、状态应用、持久化与失败事件，并发批次不得串号。`batchId` 不进入模型提示词、消息身份、缓存键或 Translation Memory 协议；追踪接收器失败不能改变翻译与 Build。

## 静态分析与开发体验

### 推荐语法与 ESLint

- 静态可提取与推荐写法是两个独立维度。Analyzer 尽量提取有限静态值；ESLint 负责报告动态参数、超出候选上限和不推荐的调用来源。
- ESLint 的通用 `no-embedded-markup` 规则在最终可提取 source 含有静态 HTML/SVG 结构时发出 warning，引导开发者把结构移出翻译调用或作为占位符传入。规则不按文案长度、行数、占位符数量、条件候选或文案树规模猜测翻译单元边界，Vanilla、Vue 与 React 共用同一判定。
- ESLint 提供译文初始化快照、Runtime 状态快照和未订阅渲染诊断，识别 Options data 与 setup 的初始化边界、tComputed() / i18nComputed() 的合法 computed 位置、自动导入的裸 `t` 与关闭自动导入时纯 Options 的显式 `methods: { t }` bridge，并报告把 `this.t` / `this.$t` 当作 ai-i18n API 的写法；这些规则只分析可可靠判断的当前文件直接调用，不承诺覆盖所有数据流。
- 可选的冗余自动导入规则只依据显式配置的当前自动导入集合判断，不读取或猜测 Vite 配置。
- Analyzer、ESLint、Vite、发布脚本与浏览器 Runtime 的开发者诊断每条只输出一种语言，不拼接中英文。Node 侧的 AI_I18N_DIAGNOSTIC_LOCALE 可固定为 zh-CN 或 en-US；auto 与未设置时按当前 Node locale 选择。浏览器 Runtime 警告按浏览器 locale 自动选择；中文 locale 使用中文，其他 locale 回退英文。诊断语言不影响翻译结果或生成文件。

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
- 相同消息跨文件共享一份自动翻译。列表按消息聚合，默认省略 source_files 与 occurrence；显式请求时
  可返回完整共享文件范围，或返回每个文件与完整行列位置。路径与位置不参与 Translation Memory
  身份，但可原样复制为人工覆盖的 `files` 或 `occurrences` 范围；MCP 不读取源码片段。相同目标和值的
  批量重复输入只执行一次，同一目标的不同值必须失败，不能由工具猜测。
- 自动译文与人工覆盖写入都必须在修改存储前校验模板 token。缺失、多出、改变编号或重复次数
  不一致时整批失败，并返回期望、实际、缺失与多余 token，供 Agent 修正后重试。
- 批量参数中重复出现的同一个未知字段合并为一条校验错误，并返回出现次数、首次位置、合法字段和
  修改动作。MCP 业务错误除稳定错误码和上下文外，始终返回 Agent 可直接执行的 next_action。
- 单语言翻译、清空和人工覆盖批次可以声明一个批次默认 locale 并省略逐项目标语言；批次默认值与
  逐项 locale 互斥，混合语言批次继续逐项声明，避免同一写入存在两个 locale 权威来源。
- 翻译消息视图支持在分页前按原文或所选 locale 的非空译文做大小写不敏感的定向过滤；过滤只改变
  页面结果，应用与文件级进度统计继续描述完整选择范围，summary 不接受消息文本过滤。
- 精确消息身份不存在时，MCP 可以返回少量只读候选，优先相同 source 的不同 comment、规范化等价
  和有限编辑距离；候选不能自动授权或替代写入目标。重复 extracted source 错误返回全部冲突物理
  文件供诊断，实际迁移由完整 Build 完成，MCP 仍不修改 extracted。
- 孤立 Translation Memory 使用独立的只读列表与破坏性删除工具。普通补译、校对和验证不得自动
  进入该流程；用户明确要求后，Agent 先完成完整 Build 和全量审查，再取得删除授权。删除只接受
  列表返回的 opaque ID，在写入前整批复验消息仍未被源码引用，并且不联动删除人工 overrides。
- 列表默认请求 100 条并允许提高到 500 条；响应大小保护只能减少完整记录数量，不能截断单条
  或破坏游标推进。
- MCP 只读取 `extracted/` 以校验消息归属；自动翻译工具只修改 `translations/`，人工工具
  只修改 `overrides/`。MCP 不读写个人 SQLite 缓存，不修改 `extracted/` 或 `locales/`，也不执行 Vite 配置。
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
- Release workflow 的 macOS 原生文件锁门禁与 Linux 发布候选验证并行，Release Please 只在
  两者都成功后运行。Release Please 生成的发布合并提交由该 workflow 验证同一 SHA，不再重复
  启动日常 CI；普通 PR 与 `main` push 的日常门禁保持不变。
- 发布候选验证只处理 npm 上尚不存在的当前包版本，在空 workspace 中安装同批 tarball，
  其余内部依赖从真实 registry 解析，并实际导入公开入口。这样本地 workspace 不能掩盖已发布
  依赖缺少 exports 或产物的错误。
- 通过发布候选验证的 tarball 与依赖优先顺序作为同一 workflow run 的短期 artifact 保留；
  Release Please 创建 Release 后只从该 artifact 选择 `paths_released` 对应包上传，不重新构建或
  打包。手动补发使用同一流程，但候选范围由已校验的 `publish_paths` 明确限定。
- 最终 tarball 必须使用精确内部版本、包含 package.json 声明的全部文件入口，并按内部依赖
  拓扑上传。发布包的公共入口、运行行为或依赖契约变化使用 `fix` / `feat` 提交；`refactor`
  不承载需要发版的变化。

## 非目标

- 远程 Translation Memory、Redis、多租户或常驻服务。
- 让插件自动判断两个不同非空译文哪个更好。
- 通过全仓库扫描推断 Agent 的目标应用。
- 为历史未发布协议提供迁移或兼容分支。
