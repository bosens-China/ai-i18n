# Vite configuration

Use Vite 8 or newer with Node.js `^20.19.0` or `>=22.12.0`. During prerelease, install
`@ai-i18n/vite@alpha`; an untagged install can resolve an older `latest` release.

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

## Framework mode

ai-i18n detects the final Vite plugin list:

- Vue plugin present: `vue` mode;
- React plugin present: `react` mode;
- neither plugin present: `vanilla` mode.

Set `framework` only when a custom plugin setup cannot be detected. A build containing both Vue and
React plugins is unsupported even when `framework` is set.

## Runtime imports and declarations

Keep explicit imports. ai-i18n writes `src/ai-i18n.d.ts` by default; keep it in the TypeScript project
or configure an included `dts` path.

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n'
// Vue or React components:
import { useI18n } from 'virtual:ai-i18n'
// Vue only:
import { tRef } from 'virtual:ai-i18n'
```

The `locales` array must be non-empty, have unique `value` fields, and include `sourceLang`. Omit
`defaultLang` when it is the same as `sourceLang`.

## Generated output and Build

Run a full Vite Build after integration. Dev processes only modules requested by the browser, while a
full Build processes the target entry's reachable module graph. The Build creates or refreshes:

- the configured declaration file;
- `translations.json` and `overrides.json`;
- the rebuildable `extracted/` and `locales/` output.

Do not edit `extracted/` or `locales/` manually.
