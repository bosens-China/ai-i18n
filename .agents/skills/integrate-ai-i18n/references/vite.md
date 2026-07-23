# Vite configuration

Use Vite 8 and a supported Node runtime (`^20.19.0` or `>=22.12.0`). Import `defineConfig` for typed configuration and register the main plugin once:

```ts
import { aiI18n } from '@ai-i18n/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
  ],
})
```

Apply these option rules:

- `locales` must be non-empty and its `value` fields unique.
- `sourceLang` must occur in `locales`.
- `defaultLang` defaults to `sourceLang` and must also occur in `locales`.
- `directory` defaults to `i18n` and is resolved from Vite `root`, not from an MCP server root or monorepo root.
- `translator` and `provider` are optional. Omit them for an Agent/MCP translation workflow.
- Keep cleanup defaults unless the user explicitly wants stale source files or orphan messages removed differently.

Add framework and HTML extractors inside the same `aiI18n()` call:

```ts
import { react } from '@ai-i18n/react/vite'
import { aiI18n, html } from '@ai-i18n/vite'
import { vue } from '@ai-i18n/vue/vite'

aiI18n({
  sourceLang: 'zh-CN',
  locales,
  extractors: [vue(), react(), html()],
})
```

Only include extractors used by the app. `html()` handles complete text bindings and, by default, `alt`, `aria-label`, `placeholder`, and `title`; pass `html({ attributes: [...] })` only to change that allowlist.

Framework extractors contribute Hook semantics to the complete JS/TS module graph, not only to `.vue` or JSX/TSX preprocessing. This allows Vue composables and React custom Hooks in plain `.ts` files to remain statically extractable.

## Optional LangChain Provider

Add `@ai-i18n/openai` only when automatic translation is required. Construct the translator in
Vite config so secrets remain in Node:

```ts
import { openAI } from '@ai-i18n/openai'

const translator = openAI({
  baseURL: process.env.AI_BASE_URL!,
  model: process.env.AI_MODEL!,
  apiKey: process.env.AI_API_KEY,
  systemPrompt: 'Translate product UI copy and preserve terminology.',
  temperature: 1,
  maxTokens: 4096,
  timeoutMs: 120_000,
  maxRetries: 3,
})

aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translator,
  provider: { batchLength: 12_000, maxConcurrency: 5 },
})
```

Treat `batchLength` as `JSON.stringify({ requests }).length`, not token count. A single oversized
message forms its own batch. `apiKey` may be omitted for a local OpenAI-compatible endpoint;
custom `headers` are supported. Pass `langSmith: { apiKey, project?, endpoint?, workspaceId? }`
only when tracing is intended. A user `systemPrompt` replaces the default prompt body, while the
Provider always appends its own JSON-only instruction and minimal example.

## Runtime and TypeScript

The browser virtual module exports `t`, `setLang`, `getLang`, `getLangs`, and `subscribe`:

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n'
```

Make the declaration visible to TypeScript in either of these ways:

```ts
/// <reference types="@ai-i18n/vite/client" />
```

or add `"@ai-i18n/vite/client"` to the existing `compilerOptions.types` array. Preserve `"vite/client"` when that array is explicit. JavaScript projects do not need this type entry.

## Generation behavior

Vite Dev accumulates modules requested by the browser, so visit lazy routes before judging coverage. Vite Build starts a fresh project state and follows the reachable module graph. Both modes generate stable `i18n/cache.json`, `i18n/extracted/**`, and `i18n/locales/**` unless `directory` changes the location.

SSR transforms and runtime injection are skipped with a warning. Do not claim server-rendered translations work merely because client hydration works.
