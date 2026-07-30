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

`autoImport` defaults to `false`. Keep explicit imports unless the user explicitly requests automatic
imports. ai-i18n writes `src/ai-i18n.d.ts` by default; keep it in the TypeScript project or configure
an included `dts` path.

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n'
// Vue or React components:
import { useI18n } from 'virtual:ai-i18n'
// Vue only:
import { tRef } from 'virtual:ai-i18n'
```

The `locales` array must be non-empty, have unique `value` fields, and include `sourceLang`. Omit
`defaultLang` when it is the same as `sourceLang`.

## Read more only when needed

Fetch the matching Markdown page from the published docs for details not covered by this Skill:

| Need | Page |
| --- | --- |
| Full plugin options | `https://bosens-china.github.io/ai-i18n/api/vite/interfaces/ai-i18n-options.md` |
| Writing translatable copy | `https://bosens-china.github.io/ai-i18n/guide/basic/static-analysis/common.md` |
| Vue or React copy patterns | `https://bosens-china.github.io/ai-i18n/guide/basic/static-analysis/vue.md` or `https://bosens-china.github.io/ai-i18n/guide/basic/static-analysis/react.md` |
| Generated files, Git, and full Build | `https://bosens-china.github.io/ai-i18n/guide/basic/directory.md` |
| Translation and human review | `https://bosens-china.github.io/ai-i18n/guide/basic/translations.md` |
| Automatic translation | `https://bosens-china.github.io/ai-i18n/guide/advanced/ai-translation.md` |
| Agent + MCP translation | `https://bosens-china.github.io/ai-i18n/guide/advanced/ai-tools.md` |
| Automatic imports or language loading | `https://bosens-china.github.io/ai-i18n/guide/basic/auto-import.md` or `https://bosens-china.github.io/ai-i18n/guide/basic/locale-loading.md` |
| ESLint, testing, or troubleshooting | `https://bosens-china.github.io/ai-i18n/guide/quality/eslint.md`, `https://bosens-china.github.io/ai-i18n/guide/quality/testing.md`, or `https://bosens-china.github.io/ai-i18n/guide/faq/common.md` |

If a published page conflicts with the installed package or this local Skill, trust the installed
package and local Skill. The deployed site can lag an unreleased repository change.
