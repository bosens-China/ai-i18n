# ai-i18n

面向 Vite 8 的浏览器端 AI 国际化插件。源码只写显式 `t()`，Vite 在 Dev/Build
期间静态提取文案、调用可选 Provider，并生成可提交 Git 的 Translation Memory。

当前为 `1.0.0-alpha` 准备阶段。仅支持 Vite 8 和浏览器 Runtime；SSR 会跳过注入并给出诊断。

## 包

- `@ai-i18n/core`：框架无关 schema、Provider 类型和 Runtime。
- `@ai-i18n/vite`：Vite 8 主插件、Vanilla Runtime、HTML extractor。
- `@ai-i18n/vue`：Vue 3 Composition API binding 和 `/vite` extractor。
- `@ai-i18n/react`：React Hook 和 `/vite` extractor。
- `@ai-i18n/openai`：基于标准 `fetch` 的可选 OpenAI-compatible Provider。
- `@ai-i18n/eslint-plugin`：提前报告无法静态求值的 `t()` 参数。
- `@ai-i18n/mcp`：让 Agent 分页读取缺失翻译并安全写回 extracted 文件的本地 MCP server。

## 快速开始

```sh
pnpm add @ai-i18n/vite
```

```ts
// vite.config.ts
import { aiI18n } from '@ai-i18n/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
  ],
})
```

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n'

console.log(t('保存', '按钮'))
console.log(getLangs())
await setLang('en-US')
```

Vite 配置可以直接导入 TypeScript 文件；插件发布产物仍是标准 ESM JavaScript 与类型声明，
不会要求宿主在 Node 运行时直接执行包内 TypeScript 源码。

### Vue、React 与 HTML

框架 extractor 是显式组合的，并共享同一个 ProjectState、cache 和浏览器 Runtime：

```ts
import { react } from '@ai-i18n/react/vite'
import { aiI18n, html } from '@ai-i18n/vite'
import { vue } from '@ai-i18n/vue/vite'

aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
  extractors: [react(), vue(), html()],
})
```

Vue 使用 `const { t } = useI18n()`，React 使用同名 Hook；HTML 只处理完整文本或白名单
属性中的静态 `t('source', 'comment?')`。普通字符串、JSXText、Vue Text 和混合 HTML
片段都不会被猜测提取。

## 提取语义

- 只识别约定 Runtime 或框架 Hook binding 的显式 `t()`。
- 参数必须能静态求值为字符串；动态参数产生带位置的 warning。
- message ID 由规范化后的 `source + optional comment` 决定，不包含文件路径。
- 缺失翻译保存为 `null`，Runtime 始终回退源语言。
- Provider 没有默认厂商、模型或业务 Prompt，必须由项目显式配置。

Dev 是渐进式的：只有浏览器实际请求到的模块才会进入累计 ProjectState，访问动态路由后
才新增对应 extracted 文件。Build 使用全新的 ProjectState，跟随 Vite 的静态与动态 import
处理完整入口可达模块图；两种模式都会更新 cache、extracted 和 locales。

## 目录协议

默认生成：

```text
i18n/
├── cache.json                 # 文件 fingerprint、引用和全局 Translation Memory
├── extracted/
│   └── src/example.ts.json    # source/comment/location/各语言翻译
└── locales/
    ├── zh-CN.json             # 源语言始终输出 source
    └── en-US.json             # 缺失项保留 null
```

JSON 使用稳定排序和统一格式，并通过临时文件 + rename 原子写入。文件中不包含绝对路径、
时间戳、API key、完整 Prompt 或 Provider 原始响应。

## Git 与 Agent 工作流

`i18n/cache.json`、`i18n/extracted/**`、`i18n/locales/**` 都应提交 Git。推荐流程：

1. 运行 `vite dev` 并访问相关页面，或运行 `vite build`，生成最新协议文件。
2. Agent 只修改 extracted 文件中对应语言的 `translations`，保留 id/source/comment。
3. 再运行 Dev 或 Build；插件会在写入前读取磁盘变更，将结果合并到 cache，并同步所有活动
   extracted 文件和 locales。
4. 源码与三类 i18n 文件一起提交，避免只提交派生文件的一部分。

分支合并时保留 `cache.json`，因为它承载文件移动/删除后的 Translation Memory。合并后重新
运行 Dev/Build 校准三类文件；同一 message/locale 的不同非空翻译会明确报冲突，必须人工
决定，插件不会 last-write-wins。

## MCP 工作流

安装 `@ai-i18n/mcp` 后，可将 `ai-i18n-mcp` 注册为本地 stdio MCP server。Agent 先读取
项目的 `vite.config.*`，结合 Vite root 与 `aiI18n({ directory })`，再向每个工具传入相对于
MCP workspace root 的最终 `i18n_directory`，例如 monorepo 中的 `apps/web/i18n`。

MCP 提供列出待翻译文件、分页读取翻译详情和批量填充缺失值三个工具。它不执行 Vite 配置、
不扫描业务源码，也不会覆盖已有非空翻译。写入只修改 extracted；运行中的 Vite Dev 会自动
同步，其余情况下由下一次 Dev/Build 校准 cache、重复 extracted 与 locales。完整契约见
[`docs/mcp/PRD.md`](./docs/mcp/PRD.md)。

## Provider

`translator` 接收缺失的 `messageId + locale` 批次。Dev 默认 100ms 防抖、批量且不阻塞首屏；
Build 会在结束前等待必要批次。可选 OpenAI-compatible Provider 使用标准 `fetch`：

```ts
import { openAI } from '@ai-i18n/openai'

const translator = openAI({
  baseURL: process.env.AI_BASE_URL!,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL!,
  prompt: '把输入文案翻译到请求的 locale，并保持产品术语一致。',
})
```

## 开发与发布

```sh
pnpm lint
pnpm check
pnpm test
pnpm build
pnpm examples:dev
pnpm examples:build
pnpm benchmark:yuku
```

发布使用 Changesets，六个公开包保持同一版本。首次 alpha 流程：

```sh
pnpm changeset pre enter alpha
pnpm version-packages
pnpm release
```

`pnpm release` 会先执行 lint、类型检查、测试和构建，再由 Changesets 使用 `alpha` dist-tag
发布。真实发布需要 npm 权限，并应在跨平台 CI 全部通过后执行。

需求、架构和验收清单位于 [`docs/phase-1`](./docs/phase-1/)。
