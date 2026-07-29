# @ai-i18n/vite

Vite 的 ai-i18n 主插件。它在 Dev/Build 中提取显式 `t()`，维护可提交 Git 的
`translations.json`、`overrides.json`、`extracted/*.json`、`locales/**`，并提供浏览器虚拟
Runtime。

alpha 阶段请安装 `@ai-i18n/vite@alpha`，避免无标签安装命中较旧的 `latest`。
Vue 模式要求 Vue ≥ 3.2.25。

每个 Vite build 只使用一个 Vanilla、Vue 或 React 模式。ai-i18n 根据最终 Vite 插件列表
推断模式，也可通过 `framework` 显式指定；同一 build 同时包含 Vue 与 React 插件族时会
报错。微前端仓库应在不同子构建中分别配置模式。

JS、TS、JSX、TSX 使用共享分析器，并按当前模式补充对应 Hook 语义；Vue 模式还会编译
SFC。ai-i18n 根据 import binding 自动识别翻译调用，不要求 JSX 文件使用框架后缀。

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

动态值使用 tagged template：`` t`你好 ${name}` ``。表达式会变成可调整顺序的编号占位符，
不会交给模型翻译。源码中原样出现的 `{{0}}` 会在内部转义为 `{{=0}}`，运行时仍按原文显示。
Runtime 发现译文占位符不匹配时会输出 console warning，但仍继续使用该译文。
`t(source, options?)` 只接受可选的 `{ comment }` 补充语境。message ID 由 source 与
规范化 comment 共同生成；任一变化都会成为新的待翻译消息。`#` 与 `\` 会自动转义。

对象或数组文案使用无需导入的编译宏：

```ts
const messages = defineI18nMessages({
  save: '保存',
  states: ['等待中', '处理中'],
});
t(messages.states[index]);
```

宏只能直接调用，不能赋值或传递；它在客户端、SSR transform 与 `aiI18nVitest()` 中消除为
原参数，不提供冻结或运行时校验。生成的 `ai-i18n.d.ts` 始终包含它的全局类型。

`autoImport: true` 在 Vanilla 模式注入顶层 Runtime API，在 React 模式注入
`useI18n` 与 `t`，在 Vue 模式额外注入 `tRef`。框架组件通过 `useI18n()` 建立更新订阅；
Vue setup 中需要预先声明响应式 label 时可直接写
`const label = tRef('保存')`，返回只读 `ComputedRef<string>`。同一 build 中不能调用 Hook 的
普通 `.js` / `.ts` 工具模块可以使用顶层 `t`。框架模式属于整个 Vite build，不按单个文件
扩展名切换。Vue 自动导入只省略 import；模板仍需在 `<script setup>` 中通过
`const { t } = useI18n()` 建立 binding 与订阅。

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
`langLoadError`。省略 `loading` 时保持全语言注册模式。

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
Translation Memory，直到同时满足已配置的限制。`maxBytes` 按稳定序列化后整个
`translations.json` 的 UTF-8 字节数计算。

现有 extracted 或 ProjectState 引用的 message 始终受保护。若活动数据自身超限，插件保留
数据并输出 warning。省略 `cache` 时不执行容量淘汰；
`cleanup.orphanMessages: true` 仍会优先删除全部非活跃消息。

普通 `vite build` 每次使用新的分析状态，并在完整模块图可用后统一写协议文件；
`vite build --watch` 会跨重建复用 ProjectState，
只重新 parse 变化 source，并刷新必要的 reverse dependents。`translations.json` 或
`overrides.json` 变化会更新翻译和注册内容，不重新 parse source；extracted 与 locale 始终
由插件重建。删除、重命名或移除 import 后，插件会校准
当前入口可达模块，同时继续保留可复用的 Translation Memory。Vite 配置、插件、extractor
或 schema 变化后需要重启 Watch 进程。

仅支持 Vite ≥ 8 和浏览器 Runtime，不支持 SSR。完整配置与文件协议见
[用户文档](https://bosens-china.github.io/ai-i18n/)。

开发者提示默认按 Node 时区选择语言：`Asia/Shanghai` 与 `Asia/Urumqi` 使用中文，其他
时区使用英文。设置 `AI_I18N_DIAGNOSTIC_LOCALE=zh-CN` 或 `en-US` 可以固定语言，`auto`
恢复自动检测。该设置不影响浏览器 Runtime 或翻译文件。
