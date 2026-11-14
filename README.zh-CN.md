<p align="center"><img src="./apps/docs/docs/public/logo.svg" alt="ai-i18n logo" height="160" /></p>

<h1 align="center">ai-i18n</h1>

<p align="center"><a href="./README.md">English</a> · <a href="https://bosens-china.github.io/ai-i18n/">文档</a> · <a href="./LICENSE">MIT License</a></p>

ai-i18n 为 Vite 8 浏览器应用提供基于原文的翻译。完整构建或显式 MCP 扫描提取 `t()` 文案并生成精简语言 JSON，支持 Vanilla、Vue 和 React。最低 Node.js 版本为 **22.13.0**；本地提取索引使用内置 `node:sqlite`。

```ts
// ai-i18n.config.ts
import { defineConfig } from '@ai-i18n/vite/config';

export default defineConfig({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
});
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { aiI18n } from '@ai-i18n/vite';

export default defineConfig({ plugins: [aiI18n()] });
```

```ts
import { t } from 'virtual:ai-i18n';

t('保存'); // 默认全局
t('保存', { comment: '按钮' }); // 独立的全局身份
t('保存', { scope: 'file' }); // 当前文件，缺译回退全局
```

人工译文写入 `i18n/locales/*.manual.json`；生成的 `i18n/locales/*.json` 只有 key→value，可按需提交 Git。可选异步 `adapter` 在每次完整构建或显式扫描时取得全量文案，自行调用翻译服务，结果不会被插件缓存。Dev 只加载已有资源，不调用适配器。

`@ai-i18n/mcp` 可扫描、查看缺译并写入人工值。接入步骤见[快速上手](https://bosens-china.github.io/ai-i18n/guide/getting-started/vanilla)，文件规则见[生成文件与 Git](https://bosens-china.github.io/ai-i18n/guide/basic/directory)。
