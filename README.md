# ai-i18n

面向 Vite 8 的浏览器端 AI 国际化插件。源码只写显式 `t()`，Vite 在 Dev / Build
期间静态提取文案，可选调用 Provider，并生成可提交 Git 的 Translation Memory。

当前为 `1.0.0-alpha` 准备阶段。仅支持 Vite 8 与浏览器 Runtime；不支持 SSR。

## 文档与示例

- 用户文档：[`apps/docs`](./apps/docs/)（本地 `pnpm docs:dev`）
- 在线示例：`examples/{vanilla,vue,react}`
- 内部 PRD / TODO：先读 [`docs/index.md`](./docs/index.md)

## 包

| 包                     | 作用                            |
| ---------------------- | ------------------------------- |
| `@boses/vite`          | Vite 8 主插件与浏览器 Runtime   |
| `@boses/core`          | schema、Provider 类型与 Runtime |
| `@boses/analyzer`      | 共享静态分析语义                |
| `@boses/openai`        | 可选 OpenAI-compatible Provider |
| `@boses/eslint-plugin` | 静态检查无法求值的 `t()`        |
| `@boses/mcp`           | 本地 MCP，供 Agent 补译         |

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
import { setLang, t } from 'virtual:ai-i18n';

console.log(t('保存', '按钮'));
await setLang('en-US');
```

框架接入、配置项、文件协议、AI 翻译与 Agent skills，见用户文档。

## 开发

```sh
pnpm check
pnpm test
pnpm build
pnpm docs:dev
```

发布使用 Changesets；细节见用户文档与仓库 Actions。
