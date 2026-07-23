# ai-i18n

面向 Vite 8 的浏览器端 AI 国际化插件。源码只写显式 `t()`，Vite 在 Dev/Build
期间静态提取文案、调用可选 Provider，并生成可提交 Git 的 Translation Memory。

当前为 `1.0.0-alpha` 准备阶段。仅支持 Vite 8 和浏览器 Runtime；SSR 会跳过注入并给出诊断。

## 包

- `@ai-i18n/core`：框架无关 schema、Provider 类型和 Runtime。
- `@ai-i18n/analyzer`：Vite 与 ESLint 共用的 Yuku 静态分析语义。
- `@ai-i18n/vite`：Vite 8 主插件、Vanilla Runtime、HTML extractor。
- `@ai-i18n/vue`：Vue 3 Composition API binding 和 `/vite` extractor。
- `@ai-i18n/react`：React Hook 和 `/vite` extractor。
- `@ai-i18n/openai`：基于 LangChain 的可选 OpenAI-compatible Provider。
- `@ai-i18n/eslint-plugin`：提前报告无法静态求值的 `t()` 参数。
- `@ai-i18n/mcp`：让 Agent 分页读取缺失翻译并安全写回 extracted 文件的本地 MCP server。

## 快速开始

```sh
pnpm add @ai-i18n/vite
```

```ts
// vite.config.ts
import { aiI18n } from '@ai-i18n/vite';
import { defineConfig } from 'vite';

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
});
```

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n';

console.log(t('保存', '按钮'));
console.log(getLangs());
await setLang('en-US');
```

Vite 配置可以直接导入 TypeScript 文件；插件通过 tsdown/Rolldown 发布为标准 ESM
JavaScript 与类型声明，不会要求宿主在 Node 运行时直接执行包内 TypeScript 源码。

### Vue、React 与 HTML

框架 extractor 是显式组合的，并共享同一个 ProjectState、cache 和浏览器 Runtime：

```ts
import { react } from '@ai-i18n/react/vite';
import { aiI18n, html } from '@ai-i18n/vite';
import { vue } from '@ai-i18n/vue/vite';

aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
  extractors: [react(), vue(), html()],
});
```

Vue 使用 `const { t } = useI18n()`，React 使用同名 Hook；HTML 只处理完整文本或白名单
属性中的静态 `t('source', 'comment?')`。普通字符串、JSXText、Vue Text 和混合 HTML
片段都不会被猜测提取。

### ESLint 静态检查

`@ai-i18n/eslint-plugin` 与 Vite 共用 `@ai-i18n/analyzer`，默认检查 Vanilla、React、
Vue Hook 以及框架中立的 JSX/TSX。Vue SFC 需要在宿主的 `vue-eslint-parser` 配置后额外
展开 `aiI18n.configs.vue`，并使用 Vue 项目已有的 compiler-sfc。插件不会默认安装 Vue
或 React 的框架 lint 规则；完整配置见
[`packages/eslint/README.md`](./packages/eslint/README.md)。

## 提取语义

- 只识别约定 Runtime 或框架 Hook binding 的显式 `t()`。
- 注册 Vue/React extractor 后，Hook binding 会覆盖模块图中的 JS、TS、JSX、TSX，包含普通
  `.ts` composable/custom Hook；既支持解构 alias，也支持 `const i18n = useI18n(); i18n.t()`。
- Vue SFC 通过 compiler-sfc 的真实 setup/template 作用域分析，尊重模板 alias、`v-for`
  局部变量和 `<script>`/`<script setup>` 隔离；外部 `<script src>` 按其 JS/TS 文件提取。
- 参数必须能静态求值为字符串；动态或尚未解析的参数产生带位置的 warning。
- `t('source', undefined)` 等同于省略 comment。
- message ID 由规范化后的 `source + optional comment` 决定，不包含文件路径。
- 缺失翻译保存为 `null`，Runtime 始终回退源语言。
- Provider 没有默认厂商或模型；内置翻译 Prompt 可由项目覆盖，但固定 JSON 尾注始终保留。

Dev 是渐进式的：只有浏览器实际请求到的模块才会进入累计 ProjectState，访问动态路由后
才新增对应 extracted 文件。Build 使用全新的 ProjectState，跟随 Vite 的静态与动态 import
处理完整入口可达模块图；两种模式都会更新 cache、extracted 和 locales。

Vue JSX 与 React JSX 可以存在于同一项目，但同一个 JSX/TSX 文件只能属于一个框架。
ai-i18n 按 Hook import binding 自动识别框架，不要求特殊文件名。宿主编译默认让 React
处理未命中的 JSX；Vue-only 项目只启用 `@vitejs/plugin-vue-jsx`，混合项目只需给 Vue JSX
插件配置任意 `include` glob，React 处理其余文件。JSX 标签本身不足以可靠判断 Runtime。

```ts
// Mixed：Vue glob 优先，未命中部分由 React fallback；文件名可以保持普通 .tsx。
vueJsx({ include: '**/src/vue/**/*.{jsx,tsx}' });
react();
```

Vue-only 项目只使用 `vueJsx()`，React-only 项目只使用 `react()`。没有框架 Hook、仅调用
`virtual:ai-i18n` 的 JSX 文件不需要分类，因为两种 Runtime 的静态提取语义相同。

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

`translator` 接收缺失的 `messageId + locale` 批次。Dev 默认 100ms 防抖，按序列化请求长度
`12_000` 成批，最多并发 `5` 个请求且不阻塞首屏；Build 会在结束前等待必要批次。可选
OpenAI-compatible Provider 使用 LangChain `ChatOpenAI`：

```ts
import { openAI } from '@ai-i18n/openai';

const translator = openAI({
  baseURL: process.env.AI_BASE_URL!,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL!,
  systemPrompt: '把输入文案翻译到请求的 locale，并保持产品术语一致。',
  temperature: 1,
  maxTokens: 4096,
  timeoutMs: 120_000,
  maxRetries: 3,
});
```

`apiKey` 可省略以调用本地 OpenAI-compatible 服务；支持自定义 `headers`。传入
`langSmith: { apiKey, project?, endpoint?, workspaceId? }` 才启用 tracing。结构化输出 schema
与提示词尾部的纯 JSON 约束由 Provider 内部固定。

## 开发与发布

```sh
pnpm check
pnpm test
pnpm build
pnpm --filter @ai-i18n/vite benchmark
```

`pnpm build` 使用 tsdown/Rolldown 构建八个公开包，并对真实 tarball 执行 publint 和
Are the Types Wrong。发布使用 Changesets；每个包独立版本，内部运行时依赖以兼容 semver
范围发布，`@ai-i18n/mcp` 也保持独立安装和发版。

推送到 `main` 后，GitHub Pages workflow 会构建四个示例并发布
[`examples/index.html`](./examples/index.html) 作为导航页；需要先在仓库 Settings → Pages 中将
发布源设为 GitHub Actions。

当前保持入口级打包，不启用 tsdown `unbundle`：`index`、`vite`、`bin` 等公开入口按
`exports` 输出，内部模块继续由 Rolldown 合并。只有未来把内部目录设计成受支持的子路径 API
时，才需要改为保留源码目录结构。

首次进入 alpha 模式时执行：

```sh
pnpm changeset pre enter alpha
pnpm version-packages
pnpm release
```

`pnpm check` 会先构建 workspace 产物，再统一执行根目录和各 workspace 的 TypeScript、ESLint
检查，因此可直接用于没有 `dist` 的干净 clone；`pnpm release` 会继续执行测试，再由
Changesets 使用 `alpha` dist-tag 发布。推送到
`main` 后，Release workflow 会维护 Version Packages PR；合并后通过 npm Trusted
Publishing 发布。仓库创建后，需要为八个包把 `bosens-China/ai-i18n` 和 `release.yml`
登记为 Trusted Publisher。

需求、架构和验收清单位于 [`docs/phase-1`](./docs/phase-1/)。
