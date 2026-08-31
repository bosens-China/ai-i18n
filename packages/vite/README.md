# @ai-i18n/vite

Vite 的 ai-i18n 主插件。它在 Dev/Build 中提取显式 `t()`，默认维护可提交 Git 的分片
`translations/`、`overrides/` 与 `src/ai-i18n.d.ts`，并生成可通过
Build 重建的 `extracted/*.json`、`locales/**`，同时提供浏览器虚拟 Runtime。

alpha 阶段请安装 `@ai-i18n/vite@alpha`，避免无标签安装命中较旧的 `latest`。
Vue 模式要求 Vue ≥ 3.2.25。

每个 Vite build 只使用一个 Vanilla、Vue 或 React 模式。ai-i18n 根据最终 Vite 插件列表
推断模式，也可通过 `framework` 显式指定；同一 build 同时包含 Vue 与 React 插件族时会
报错。微前端仓库应在不同子构建中分别配置模式。

源码提取只支持浏览器端 ESM。Vanilla 分析 `.js`、`.mjs`、`.ts`、`.mts`；Vue 与 React
额外分析 `.jsx`、`.tsx`，Vue 额外分析 `.vue`。不支持 `.cjs`、`.cts`、`require()` 或
`module.exports`。Vite 对配置文件和 CommonJS 依赖的兼容不属于 ai-i18n 源码提取能力。
ai-i18n 根据 import binding 自动识别翻译调用，不要求 JSX 文件使用框架后缀。

在 monorepo 中，一个插件实例会处理当前 Vite build 可达的本地 workspace ESM 源码，
包括 Vite root 外的共享包。外部源码在协议中记录为相对当前 root 的 POSIX 路径，例如
`../../packages/ui/src/Button.vue`；不会写入机器绝对路径。共享包不需要再次注册插件，
但 `node_modules` 中的预构建依赖仍不参与源码提取。

`extracted/` 的物理 JSON 文件名是标准化 source 的 SHA-256，文件内容仍保存完整 source。
监听与 MCP 按 JSON 内容识别源码，不从 hash 反推。

每个 Vite build 必须使用独立的 `directory`。多个应用不能通过共用 i18n 目录来共享译文，
因为完整 Build 会按当前模块图重建 `extracted/` 与 `locales/`。

```ts
import { aiI18n } from '@ai-i18n/vite';

aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
});
```

## 翻译校对

翻译校对通过独立 Vite 插件显式启用：

```ts
import { aiI18n } from '@ai-i18n/vite';
import { aiI18nReview } from '@ai-i18n/vite/review';

export default defineConfig({
  plugins: [aiI18n({ sourceLang: 'zh-CN', locales }), aiI18nReview()],
});
```

注册后，Vite Dev 在业务页面底部注入翻译校对图标。点击后会在当前页面内打开类似 DevTools 的校对工作台，
工作台固定在页面底部；拖动上边缘可以调整高度，高度会保存在当前浏览器中。Dev 控制台也会打印固定的
`/__ai-i18n/` 独立审查地址。独立页默认展示全部已提取文案；依赖业务 DOM 的当前页面范围与页面取词只在
嵌入工作台提供。

两个入口提示可以分别关闭，但独立地址和 Review API 仍然可用：

```ts
aiI18nReview({
  launcher: false, // 不向业务页面注入右下角入口
  printUrl: false, // 不在 Dev 控制台打印地址
});
```

嵌入工作台默认只列出当前 DOM 中实际出现的文案，也可以切换到全部已提取文案。选择“页面取词”后再点击业务元素，可以直接定位对应文案；点击列表中属于当前页面的文案，则会把业务页面滚动到第一个可见匹配元素并短暂高亮。静态 HTML
能够携带精确源码位置，Vue、React 或普通运行时字符串无法唯一还原时会显示全部候选文件、行和列，
左侧会进入可返回的定位结果层级，不会猜测第一项。

人工译文可按全局、精确源码文件或精确文件行列位置保存。同一行的多个相同调用通过各自的列号区分；
作用范围优先级为位置、文件、全局。

人工译文写入 `i18n/overrides/` 分桶，保存和删除都会通过 HMR 更新业务页面。宿主使用 Web Component
和 Shadow DOM，UnoCSS 与 reset 只加载到工作台根节点。校对页面仅存在于
Vite Dev，不进入 Build、Preview 或生产产物；界面已作为静态资源随插件提供，业务项目不需要安装
Vue 或其他 UI 依赖。它不使用 token，只接受同源 JSON 写入。不注册 `aiI18nReview()` 时，不会注入
入口、Review API 或工作台资源。

工作台的设置页可选择深色、浅色或跟随系统外观，也可选择跟随浏览器、中文或 English 界面语言。
这些偏好只保存在当前浏览器，不写入项目配置或翻译文件；页面内入口壳和工作台会即时同步。

## Dev 慢阶段诊断

性能诊断默认关闭。首次打开页面或懒路由明显变慢时，可临时开启阶段耗时日志：

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  diagnostics: {
    timing: { minDurationMs: 20 },
  },
});
```

日志只在 Vite Dev 中输出达到阈值的阶段，并携带相对 Vite root 的规范化模块 ID。
总阶段为 `source-transform` 和 `file-sync`；还会输出
`plugin-ready-wait`、`source-analysis`、`source-registration`、`dependency-resolution`、
`state-transaction`、`snapshot-build`、`extracted-scan`、`translation-memory-sync`、
`extracted-write` 与 `locale-write` 子阶段。总阶段与子阶段可能嵌套，不能直接相加。
其中 `dependency-resolution` 可能包含 Vite `resolve()`、Dev Environment 完整转换或 Build
`load()`，以及子模块嵌套转换等待，
不是纯粹的插件解析 CPU，需结合页面可见时间和子模块日志判断是否处于关键路径。
`timing: true` 使用 50ms 默认阈值。日志不包含源码正文、译文或凭据，也不写入项目文件；
排查结束后应关闭。

Dev 转换先更新当前进程的内存状态，只登记变化源码；连续转换会在短窗口内合并，真正写入前才生成
一次最新快照。普通批次只更新变化源码对应的 extracted 与 locale 消息，并保留未访问模块的已有内容，
因此普通模块响应不等待每次完整目录同步。持续变化也有最大等待时间，不会无限推迟持久化。人工校对、
Provider 结果、外部协议文件变化和 Dev Server 关闭等边界仍会等待待提交写入；Build 与 MCP 的文件
语义不变，完整 Build 仍负责全量活动集合与历史清理校准。

Dev 中的模块消息会随原业务模块同步注册到共享 Runtime，不再为每个源码模块请求独立注册模块。
开启 `autoImport` 时，注入的 API 共用一个 Runtime；关闭时，普通静态命名的
`virtual:ai-i18n` 显式 import 也会在 Dev 中内联为共享 Runtime 的文件 binding。Vue 编译宏参数引用、
namespace、动态 import、直接 re-export、纯副作用和混合 type/未知导出的 import 保留 scoped 兼容
路径。Build 继续使用静态虚拟模块，但这些模块被合并到业务 chunk，不会天然形成逐源码浏览器请求。
MCP、Provider 或校对页更新 `translations/` / `overrides/` 后，运行中的 Dev Server 会重新
读取存储并通过 HMR 更新已激活模块，不需要把内存注册数据写成项目实体文件。

插件会把 `@ai-i18n/vite/runtime`、`@ai-i18n/vite/vue` 和 `@ai-i18n/vite/react` 合并进
Vite 的 `optimizeDeps.exclude`，并保留项目原有配置。这样可以避免插件运行时入口在首次动态路由访问时
才被依赖优化器发现并触发页面重载；日志中其他业务依赖的延迟优化仍需按 Vite 项目本身处理。

## Translation Memory

项目自动译文始终按目标语言和稳定 SHA-256 身份写入
`i18n/translations/<locale>/<0-f>.json`，每种目标语言最多 16 个非空分桶，不使用集中 manifest 或
存储标记。桶内条目以完整身份哈希为键；Vite、MCP、团队成员和 CI 都以这些项目文件为唯一事实来源。

需要在同一台电脑的项目间复用候选时，可增加个人 SQLite 缓存：

```ts
import { sqlite } from '@ai-i18n/sqlite';

aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: { cache: sqlite() },
});
```

SQLite 是独立可选包。只使用默认 JSON 的项目不安装 `@ai-i18n/sqlite`，依赖图中也不会包含
`better-sqlite3`。

数据库默认位于系统用户数据目录，可用 `AI_I18N_DATA_DIR` 覆盖，不写入项目也不提交 Git。只有同一
语义身份的候选唯一时才自动复用；命中候选会先补写项目 JSON，候选冲突时保持缺失。Provider 结果在
项目 JSON 成功写入后回填缓存。删除数据库不改变已提交项目的结果，`overrides/` 始终优先级最高。

模型、`baseURL`、温度或提示词变化后需要重跑时，在 Provider 中使用 `cache: 'fresh'`。该策略不区分
Dev/Build：它会刷新一次已有自动译文，并持久化、复用本进程新结果；失败或空结果不会因普通 HMR
立即重复请求。默认 `cache: 'reuse'`。该选项只影响 Provider 调用，不改变项目 JSON、MCP 或可选
SQLite 候选缓存的写入边界。插件不对任意 Translator 内部配置生成失效指纹。

Vite 为每次实际 Translator 调用传入可选诊断 `batchId`。日志型 Translator 可以实现可选的
`reportBatchEvent`，接收 `scheduled`、`state-applied`、`persisted` 和 `failed` 生命周期事件；普通
函数无需实现。追踪接收器失败只产生 warning，不会阻塞翻译或 Build。`batchId` 不发送给模型，也不
写入 Translation Memory、message ID 或缓存键。

`provider.logging` 默认是 `false`。显式设为 `true` 时使用 Vite root 下的 `logs/`；字符串表示日志
目录，相对路径基于 Vite root，绝对路径保持不变，空字符串无效。Vite 总会向实现
`reportBatchEvent` 的 Translator 报告生命周期，并把解析后的关闭状态或目录传给 Translator；关闭时
官方 OpenAI Provider 不创建或追加日志，但翻译、提取、缓存和持久化保持不变。自定义 Translator
可以忽略这个可选诊断字段。

动态值使用 tagged template：`` t`你好 ${name}` ``。表达式会变成可调整顺序的编号占位符，
不会交给模型翻译。源码中原样出现的 `{{0}}` 会在内部转义为 `{{=0}}`，运行时仍按原文显示。
Runtime 发现译文占位符不匹配时会输出 console warning，但仍继续使用该译文。
`t(source, options?)` 只接受可选的 `{ comment }` 补充语境。message ID 由 source 与
规范化 comment 共同生成；任一变化都会成为新的待翻译消息。`#` 与 `\` 会自动转义。

整棵静态纯文案对象或数组可以直接翻译，不要求 `as const` 或编译宏：

```ts
const messages = {
  save: '保存',
  states: ['等待中', '处理中'],
};

const labels = t(messages);
// Vue setup：const labels = tRef(messages);
```

每个字符串叶子都会翻译，其他基础类型原样保留。只支持普通对象和数组，不支持 `Map`、
`Set`、函数、循环引用或运行时生成的集合。需要选择对象或数组成员时，再使用无需导入的
编译宏：

```ts
const messages = defineI18nMessages({
  save: '保存',
  states: ['等待中', '处理中'],
});
t(messages.states[index]);
```

消息集合可以从独立 ESM 源码导入；Dev 首次请求会先按 Vite 的最终解析结果转换尚未分析的本地
依赖，因此相对路径、alias、tsconfig paths 与 resolver plugin 不需要预热或手工刷新。

宏只能直接调用，不能赋值或传递；它在客户端、SSR transform 与 `aiI18nVitest()` 中消除为
原参数表达式，因此参数对象或数组仍可在运行时使用。不能引用、传递或保存宏函数本身。宏不提供冻结
或运行时校验。生成的 `ai-i18n.d.ts` 始终包含它的全局类型。

`autoImport: true` 在三种模式都注入顶层 Runtime API；React 额外注入 `useI18n`，Vue
额外注入 `useI18n`、`tRef`、`i18nComputed` 与 `tComputed`。Vue 组件可在 `<script>`、
`<script setup>`、Options API 的 `computed` / `methods` 与 template 中直接调用 `t()`。
Vue 版顶层 `t` 会追踪 Runtime revision，因此 template、render 与 computed 会随语言切换
刷新。`useI18n().t` 与顶层导出是同一个函数，Vue 的响应式刷新由 adapter 的共享 revision
驱动，并非每个组件调用 Composable 后单独订阅。自动导入模式的新建 setup 组件直接使用
裸 `t()`；`useI18n()` 用于读取响应式状态和 action。React 组件仍通过 `useI18n()` 建立
更新订阅。

Vue setup 中需要预先声明响应式 label 或文案树时，可写
`const label = tRef('保存')` 或 `const labels = tRef(messages)`，返回只读计算属性。纯
Options 组件把 `...i18nComputed()` 展开到 `computed`，即可直接读取 `currentLang`、
`langs`、`langLoadState`、`isLangLoading` 与 `langLoadError`；预声明响应式文案使用
`label: tComputed('保存')`。TypeScript 组件应使用 `defineComponent()`，并开启 `strict`
或至少开启 `noImplicitThis`，以获得准确的 `this` 与 template 类型提示。
自动导入模式下，生成的 dts 会同时声明 script 全局 API 与 Vue template 的 `t`，因此
`<script setup>`、普通 `<script>`、纯 Options 和 template-only SFC 都无需补充 import 或
`methods: { t }`；Volar 与 `vue-tsc` 可直接检查。关闭自动导入时，`<script setup>` 顶层
显式 import 会自然成为 template binding；普通 Options `<script>` 的 import 不会成为组件
实例属性，template 直接使用时仍需通过 `methods: { t }` 建立真实 binding。脚本调用始终写
词法作用域的 `t()`，不使用 `this.t()`。

Vue 自动导入会在主 dts 旁生成同名的 `.vue.d.ts` template 类型桥；若该路径已有不带
ai-i18n 生成标记的用户文件，插件会报错且不会覆盖。把 `dts` 改到新路径或设为 `false`
后，插件无法可靠推断旧的自定义路径，请手动删除旧的主 dts 与相邻 `.vue.d.ts`。

同一 build 中不能调用 Hook 的普通 ESM 工具模块可以使用顶层 Runtime API。`getLang()` 与
`getLangLoadState()` 返回快照，不会自动变成框架响应式状态。框架模式属于整个 Vite build，
不按单个文件扩展名切换。Vue 自动导入只处理未绑定的 API 引用；模板局部变量以及组件自身的
prop、data、computed、method、inject 或 setup 返回值具有更高优先级。`this.t` 与
`this.$t` 不属于 ai-i18n 调用。

Vue template 的提取与自动注入目前只支持默认 HTML template 和 `lang="html"`。Pug 等
预处理 template 请在 `<script>` / computed 中调用 `t()`，再把结果交给模板渲染。

Vitest 使用 `@ai-i18n/vite/vitest` 的 `aiI18nVitest()`，无需手写 alias，也不会读写协议文件；
生产开启自动导入时，把同一个 `autoImport: true` 传给测试插件。
语言偏好可用 `persist` 配置；缺译固定返回 source 文案，数组和普通对象保持原结构。已有的
`vi.mock('virtual:ai-i18n')` 或手写 alias 会覆盖测试 Runtime，应当删除。

## Locale Lazy

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
  ],
  loading: {
    preload: ['en-US'],
    prefetch: ['ja-JP'],
  },
});
```

配置 `loading` 后，每个目标 locale 会生成独立 Vite chunk。`preload` 使用
`modulepreload` 尽早准备模块，`prefetch` 以较低优先级提示浏览器缓存。其他目标语言在首次
`setLang()` 时加载。source locale 不生成语言资产，也不能出现在两个列表中。

目标语言加载期间继续返回 source fallback；加载成功后再提交切换并通知订阅者。相同 locale
的并发切换共享请求，不同 locale 以最后一次调用为准。非 source 的 `defaultLang` 自动采用
preload 语义。`getLangLoadState()` 返回共享的 `idle` / `loading` / `error` 快照；
Vue / React 的 `useI18n()` 额外返回 `langLoadState`、`isLangLoading` 与
`langLoadError`。纯 Options 组件通过 `...i18nComputed()` 获得同一组已解包的响应式状态，
并可直接使用 Options `watch.currentLang` 监听成功的语言切换。省略 `loading` 时保持全语言
注册模式。

## Translation Memory 容量

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: {
    capacity: {
      maxMessages: 20_000,
      maxBytes: 10 * 1024 * 1024,
    },
  },
});
```

两个限制都是可选正整数；任一限制超出时，插件按 message ID 稳定淘汰非活跃的
Translation Memory，直到同时满足已配置的限制。`maxBytes` 按稳定序列化后的逻辑
Translation Memory 快照计算，与 JSON 分片或 SQLite 物理布局无关。

现有 extracted 或 ProjectState 引用的 message 始终受保护。若活动数据自身超限，插件保留
数据并输出 warning。省略 `translationMemory.capacity` 时不执行容量淘汰；
`cleanup.orphanMessages: true` 仍会优先删除全部非活跃消息。

普通 `vite build` 每次使用新的分析状态，并在完整模块图可用后统一写协议文件；
`vite build --watch` 会跨重建复用 ProjectState，
只重新 parse 变化 source，并刷新必要的 reverse dependents。Translation Memory 或
`overrides/` 分片变化会更新翻译和注册内容，不重新 parse source；extracted 与 locale 始终
由插件重建。删除、重命名或移除 import 后，插件会校准
当前入口可达模块，同时继续保留可复用的 Translation Memory。Vite 配置、插件、extractor
或 schema 变化后需要重启 Watch 进程。

仅支持 Vite ≥ 8 和浏览器 Runtime，不支持 SSR。完整配置与文件协议见
[用户文档](https://bosens-china.github.io/ai-i18n/)。

开发者提示每条只使用中文或英文。Node 侧默认按当前系统 locale 选择：中文 locale 使用中文，
其他 locale 回退英文。设置 `AI_I18N_DIAGNOSTIC_LOCALE=zh-CN` 或 `en-US` 可以固定 Node
侧语言，`auto` 恢复自动检测。浏览器 Runtime warning 按浏览器 locale 自动选择语言；上述设置
不影响翻译文件。
