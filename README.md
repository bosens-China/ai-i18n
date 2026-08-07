<p align="center">
  <img src="./apps/docs/docs/public/logo.png" alt="ai-i18n logo" height="160" />
</p>

<h1 align="center">ai-i18n</h1>

<p align="center">
  AI-powered internationalization for Vite applications.
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="https://bosens-china.github.io/ai-i18n/">Documentation</a> ·
  <a href="https://bosens-china.github.io/ai-i18n/demo/">Demo</a> ·
  <a href="./LICENSE">MIT License</a>
</p>

Write source copy where it is used. ai-i18n extracts supported `t()` calls, manages
translations and locale bundles, and provides a browser runtime for Vanilla, Vue, and React.
Use an OpenAI-compatible provider for automated translation or the MCP server for agent-assisted
translation and human review.

## Why ai-i18n

- No translation-key maintenance for supported static copy.
- Build-time extraction, typed runtime APIs, and optional lazy locale loading.
- Git-friendly translation memory with separate human overrides.
- Companion packages for ESLint, OpenAI-compatible translation, and MCP workflows.

## Quick start

ai-i18n is currently in alpha. Install the Vite plugin with the alpha tag:

```bash
pnpm add @ai-i18n/vite@alpha
```

Configure the plugin:

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

Use `t()` directly in your application code:

```ts
import { t } from 'virtual:ai-i18n';

console.log(t('你好，世界！'));
console.log(t`你好，${user.name}！`);
```

See the [documentation](https://bosens-china.github.io/ai-i18n/) for framework setup,
translation providers, MCP integration, and API references.
