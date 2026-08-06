# @ai-i18n/vite

Vite 的 ai-i18n 主插件。它在 Dev/Build 中提取显式 `t()`，默认维护可提交 Git 的分片
`translations/*.json`、`overrides.json` 与 `src/ai-i18n.d.ts`，并生成可通过
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

## Translation Memory

默认 `translationMemory.storage: 'json'`，消息按稳定 SHA-256 前缀写入
`i18n/translations/<xx>.json`，并由 `manifest.json` 记录 revision 和有效分片。旧版单文件
`translations.json` 会自动迁移。JSON 不生成 `storage.json`；缺少标记时 Vite 与 MCP 都选择 JSON。

需要在同一台电脑的项目间共享自动译文时，可改用用户级全局 SQLite：

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: { storage: 'sqlite' },
});
```

数据库默认位于系统用户数据目录，可用 `AI_I18N_DATA_DIR` 覆盖，不写入项目也不提交 Git。
项目内的 `storage.json` 只声明 SQLite，应与 `overrides.json` 一起提交。
数据库物理全局、逻辑按规范化项目路径绑定；只有同一语义身份的候选唯一时才跨项目自动复用，
候选冲突时保持缺失。`overrides.json` 始终位于项目内且优先级最高。

模型、`baseURL`、温度或提示词变化后需要重跑时，在 Provider 中使用 `cache: 'fresh'`。该策略不区分
Dev/Build：它会刷新一次已有自动译文，并持久化、复用本进程新结果；失败或空结果不会因普通 HMR
立即重复请求。默认 `cache: 'reuse'`。该选项只影响 Provider 调用，不改变 MCP、JSON 或 SQLite 的
读写语义。插件不对任意 Translator 内部配置生成失效指纹。

Vite 为每次实际 Translator 调用传入可选诊断 `batchId`。日志型 Translator 可以实现可选的
`reportBatchEvent`，接收 `scheduled`、`state-applied`、`persisted` 和 `failed` 生命周期事件；普通
函数无需实现。追踪接收器失败只产生 warning，不会阻塞翻译或 Build。`batchId` 不发送给模型，也不
写入 Translation Memory、message ID 或缓存键。

`provider.logging` 默认是 `false`。显式设为 `true` 时使用 Vite root 下的 `logs/`；字符串表示日志
目录，相对路径基于 Vite root，绝对路径保持不变，空字符串无效。启用时 Vite 报告上述生命周期并把
解析后的目录传给 Translator；关闭时官方 OpenAI Provider 不创建或追加日志，但翻译、提取、缓存和
持久化保持不变。自定义 Translator 可以忽略这个可选诊断字段。

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

宏只能直接调用，不能赋值或传递；它在客户端、SSR transform 与 `aiI18nVitest()` 中消除为
原参数，不提供冻结或运行时校验。生成的 `ai-i18n.d.ts` 始终包含它的全局类型。

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
语言偏好可用 `persist` 配置；缺译固定返回 source 文案。

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

## Cache 容量

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  cache: {
    maxMessages: 20_000,
    maxBytes: 10 * 1024 * 1024,
  },
});
```

两个限制都是可选正整数；任一限制超出时，插件按 message ID 稳定淘汰非活跃的
Translation Memory，直到同时满足已配置的限制。`maxBytes` 按稳定序列化后的逻辑
Translation Memory 快照计算，与 JSON 分片或 SQLite 物理布局无关。

现有 extracted 或 ProjectState 引用的 message 始终受保护。若活动数据自身超限，插件保留
数据并输出 warning。省略 `cache` 时不执行容量淘汰；
`cleanup.orphanMessages: true` 仍会优先删除全部非活跃消息。

普通 `vite build` 每次使用新的分析状态，并在完整模块图可用后统一写协议文件；
`vite build --watch` 会跨重建复用 ProjectState，
只重新 parse 变化 source，并刷新必要的 reverse dependents。Translation Memory 或
`overrides.json` 变化会更新翻译和注册内容，不重新 parse source；extracted 与 locale 始终
由插件重建。删除、重命名或移除 import 后，插件会校准
当前入口可达模块，同时继续保留可复用的 Translation Memory。Vite 配置、插件、extractor
或 schema 变化后需要重启 Watch 进程。

仅支持 Vite ≥ 8 和浏览器 Runtime，不支持 SSR。完整配置与文件协议见
[用户文档](https://bosens-china.github.io/ai-i18n/)。

开发者提示默认按 Node 时区选择语言：`Asia/Shanghai` 与 `Asia/Urumqi` 使用中文，其他
时区使用英文。设置 `AI_I18N_DIAGNOSTIC_LOCALE=zh-CN` 或 `en-US` 可以固定语言，`auto`
恢复自动检测。该设置不影响浏览器 Runtime 或翻译文件。
