<p align="center"><img src="./apps/docs/docs/public/logo.svg" alt="ai-i18n logo" height="160" /></p>

<h1 align="center">ai-i18n</h1>

<p align="center">Source-text localization for Vite 8 browser applications.</p>

<p align="center"><a href="./README.zh-CN.md">简体中文</a> · <a href="https://bosens-china.github.io/ai-i18n/">Documentation</a> · <a href="./LICENSE">MIT License</a></p>

ai-i18n extracts explicit `t()` calls during a full Build or MCP scan and generates compact locale JSON. It supports Vanilla, Vue, and React. Node.js **22.13.0+** is required because the local extraction index uses built-in `node:sqlite`.

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

t('保存'); // shared globally
t('保存', { comment: 'button' }); // separate global identity
t('保存', { scope: 'file' }); // this file, then global fallback
```

Manual translations live in `i18n/locales/*.manual.json`. Generated `i18n/locales/*.json` files contain only key-value pairs and can be committed. An optional async adapter can fetch or translate the complete catalog once per Build or explicit scan; its results are not cached by the plugin. Dev loads existing resources and does not invoke the adapter.

Use `@ai-i18n/mcp` to scan, list missing translations, and write manual values. See the [getting started guide](https://bosens-china.github.io/ai-i18n/guide/getting-started/vanilla) and [file layout](https://bosens-china.github.io/ai-i18n/guide/basic/directory).
