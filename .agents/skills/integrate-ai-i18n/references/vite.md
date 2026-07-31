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

## Source module boundary

ai-i18n extracts only browser ESM source:

| Mode | Source extensions |
| --- | --- |
| Vanilla | `.js`, `.mjs`, `.ts`, `.mts` |
| Vue | `.js`, `.mjs`, `.ts`, `.mts`, `.jsx`, `.tsx`, `.vue` |
| React | `.js`, `.mjs`, `.ts`, `.mts`, `.jsx`, `.tsx` |

Do not promise extraction from `.cjs`, `.cts`, `require()`, or `module.exports`, and do not rewrite
CommonJS as an incidental integration change. Vite config loading and dependency pre-bundling are
separate from ai-i18n source extraction.

In a monorepo, one plugin instance also extracts Vite-resolved local ESM source outside the Vite root.
Treat the consuming Vite build as the owner. Do not install or register the Vite plugin in a
source-only package, and do not promise extraction from prebuilt `node_modules` code. Every
independent Vite build must use its own `directory`.

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

Vue auto import also writes an adjacent `.vue.d.ts` template bridge. If that path contains a
non-generated user file, stop and ask the user to choose another `dts` path; never overwrite it.
After changing `dts` or setting `dts: false`, explicitly remove the old generated primary and
companion declarations because the plugin cannot infer a previous custom path.

For an app-private workspace package that uses auto imports, configure `dts` to a file included by
both the app and package TypeScript projects. Prefer explicit `virtual:ai-i18n` imports in reusable
packages so they do not depend on one consumer's global declarations. Never let independent builds
overwrite one shared declaration file.

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n'
// Vue or React components:
import { useI18n } from 'virtual:ai-i18n'
// Vue only:
import {
  i18nComputed,
  tComputed,
  tRef,
} from 'virtual:ai-i18n'
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
