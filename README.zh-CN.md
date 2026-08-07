<p align="center">
  <img src="./apps/docs/docs/public/logo.png" alt="ai-i18n 标志" height="160" />
</p>

<h1 align="center">ai-i18n</h1>

<p align="center">
  面向 Vite 应用的 AI 国际化工具。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="https://bosens-china.github.io/ai-i18n/">文档</a> ·
  <a href="https://bosens-china.github.io/ai-i18n/demo/">在线演示</a> ·
  <a href="./LICENSE">MIT 许可证</a>
</p>

在代码中直接编写源文案。ai-i18n 会提取受支持的 `t()` 调用，管理译文和语言包，并为 Vanilla、Vue
和 React 提供浏览器运行时。你可以使用 OpenAI 兼容 Provider 自动翻译，也可以通过 MCP 服务让
Agent 协助翻译和人工审校。

## 为什么选择 ai-i18n

- 无需为受支持的静态文案维护翻译 Key。
- 在构建时提取文案，提供类型化运行时 API，并支持按需加载语言包。
- 使用适合提交到 Git 的翻译记忆，并将人工审校与自动译文分开保存。
- 提供 ESLint、OpenAI 兼容翻译和 MCP 工作流的配套包。

## 快速开始

ai-i18n 目前处于 alpha 阶段，请使用 alpha 标签安装 Vite 插件：

```bash
pnpm add @ai-i18n/vite@alpha
```

在 Vite 中配置插件：

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { aiI18n } from '@ai-i18n/vite';

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '简体中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
  ],
});
```

直接在应用代码中使用 `t()`：

```ts
import { t } from 'virtual:ai-i18n';

console.log(t('你好，世界！'));
console.log(t`你好，${user.name}！`);
```

更多框架接入、翻译 Provider、MCP 集成和 API 说明，请查看[官方文档](https://bosens-china.github.io/ai-i18n/)。
