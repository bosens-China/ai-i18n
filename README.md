# ai-i18n

面向 Vite 8 的浏览器端 AI 国际化插件。源码只写显式 `t()`，Vite 在 Dev/Build
期间静态提取文案、调用可选 Provider，并生成可提交 Git 的 Translation Memory。

当前为 `1.0.0-alpha` 准备阶段。仅支持 Vite 8 和浏览器 Runtime；SSR 会跳过注入并给出诊断。

## 包

- `@boses/core`：框架无关 schema、Provider 类型和 Runtime。
- `@boses/analyzer`：Vite 与 ESLint 共用的 Yuku 静态分析语义。
- `@boses/vite`：Vite 8 主插件、三种框架模式、响应式 Hook、HTML 提取和浏览器 Runtime。
- `@boses/openai`：基于 LangChain 的可选 OpenAI-compatible Provider。
- `@boses/eslint-plugin`：提前报告无法静态求值的 `t()` 参数。
- `@boses/mcp`：让 Agent 分页读取缺失翻译并安全写回 extracted 文件的本地 MCP server。

## 快速开始

```sh
pnpm add @boses/vite
```

```ts
// vite.config.ts
import { aiI18n } from '@boses/vite';
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

### Vue、React 与自动导入

每个 Vite build 只选择一种模式：`vanilla`、`vue` 或 `react`。插件在
`configResolved` 阶段读取最终插件列表：检测到 `vite:vue`/`vite:vue-jsx` 时使用 Vue，
检测到 `vite:react*` 时使用 React，都没有时回落 Vanilla。配置 `framework` 可以强制覆盖
推断；同一个 build 同时安装 Vue 与 React Vite 插件会直接报错。

```ts
import { aiI18n } from '@boses/vite';
import vue from '@vitejs/plugin-vue';

export default {
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      html: true,
    }),
    vue(),
  ],
};
```

显式导入始终可用，Vue 和 React 都从同一个虚拟模块获取 Hook，不再书写框架包后缀：

```ts
import { useI18n } from 'virtual:ai-i18n';
```

如果最终插件列表包含 `unplugin-auto-import`，ai-i18n 会默认启用自己的按需导入，
`useI18n()` 可以直接使用。这里外部插件只是明确的 DX 开关；真正插入
`virtual:ai-i18n` import 的仍是 ai-i18n，因此无需把 `useI18n` 再写进 Auto Import 的
`imports`。`autoImport: true` 或 `false` 可以强制覆盖检测结果。

启用按需导入时，插件默认生成 `src/ai-i18n.d.ts`；ESLint 分别使用
`aiI18n.configs.vanilla`、`.vue` 或 `.react` 声明相应只读全局。HTML 使用 `html: true`
启用，也可传 `{ attributes: [...] }` 修改属性白名单。

### ESLint 静态检查

`@boses/eslint-plugin` 与 Vite 共用 `@boses/analyzer`，默认检查 Vanilla、React、
Vue Hook 以及框架中立的 JSX/TSX。Vue SFC 需要在宿主的 `vue-eslint-parser` 配置后额外
展开 `aiI18n.configs.vue`，并使用 Vue 项目已有的 compiler-sfc。插件不会默认安装 Vue
或 React 的框架 lint 规则；完整配置见
[`packages/eslint/README.md`](./packages/eslint/README.md)。

## 提取语义

- 只识别约定 Runtime 或框架 Hook binding 的显式 `t()`。
- Vue/React 模式下，Hook binding 会覆盖模块图中的 JS、TS、JSX、TSX，包含普通 `.ts`
  composable/custom Hook；既支持解构 alias，也支持 `const i18n = useI18n(); i18n.t()`。
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

Vue 模式支持 `.vue`、JS/TS 以及由 `@vitejs/plugin-vue-jsx` 编译的 JSX/TSX；React 模式
支持 JS/TS/JSX/TSX。这里不再兼容同一个 Vite build 混用 Vue/React 语法。微前端场景应让
每个子应用使用自己的 Vite 配置和 ai-i18n 状态，各自选择一种模式。

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

安装 `@boses/mcp` 后，可将 `ai-i18n-mcp` 注册为本地 stdio MCP server。Agent 先读取
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
import { openAI } from '@boses/openai';

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
pnpm --filter @boses/vite benchmark
```

`pnpm build` 使用 tsdown/Rolldown 构建六个公开包，并对真实 tarball 执行 publint 和
Are the Types Wrong。发布使用 Changesets；每个包独立版本，内部运行时依赖以兼容 semver
范围发布，`@boses/mcp` 也保持独立安装和发版。

推送到 `main` 后，GitHub Pages workflow 会构建三个示例并发布
[`examples/index.html`](./examples/index.html) 作为导航页；需要先在仓库 Settings → Pages 中将
发布源设为 GitHub Actions。

当前保持入口级打包，不启用 tsdown `unbundle`：`index`、`vite`、`bin` 等公开入口按
`exports` 输出，内部模块继续由 Rolldown 合并。只有未来把内部目录设计成受支持的子路径 API
时，才需要改为保留源码目录结构。

当前仓库已进入 `alpha` 预发布模式。六个包首次发布前，先在本地完成版本更新和引导发布：

```sh
pnpm version-packages
npm login
pnpm release
```

`pnpm check` 会先构建 workspace 产物，再统一执行根目录和各 workspace 的 TypeScript、ESLint
检查，因此可直接用于没有 `dist` 的干净 clone；`pnpm release` 会继续执行测试，再由
Changesets 使用 `alpha` dist-tag 一次发布六个公开包。首次发布成功并将 `release.yml`
合并到 `main` 后，在仓库 Settings → Actions → General 中允许 GitHub Actions 创建 Pull
Request，再使用 npm CLI 为所有包登记同一个 Trusted Publisher：

```sh
for package in analyzer core eslint-plugin mcp openai vite; do
  npm trust github "@boses/$package" \
    --repo bosens-China/ai-i18n \
    --file release.yml \
    --allow-publish \
    --yes
  sleep 2
done
```

`release.yml` 不使用 `NPM_TOKEN`，通过 GitHub Actions OIDC 发布。后续功能修改先运行
`pnpm changeset` 并提交生成的 changeset；推送到 `main` 后，Release workflow 会维护
Version Packages PR，合并该 PR 后自动运行检查、测试和 npm 发布。

需求、架构和验收清单位于 [`docs/phase-1`](./docs/phase-1/)。
