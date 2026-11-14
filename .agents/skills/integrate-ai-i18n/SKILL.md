---
name: integrate-ai-i18n
description: Integrate ai-i18n into a Vite 8 browser app using Vue 3, React 18+, or vanilla JavaScript/TypeScript. Use for installation, configuration, t() calls, framework setup, build translation adapters, locale loading, Review, or migration from older ai-i18n versions.
---

# Integrate ai-i18n

Read the public [documentation index](https://bosens-china.github.io/ai-i18n/llms.txt), then the relevant framework and configuration pages. Prefer installed types and behavior when published docs lag.

Inspect the app's `package.json`, `vite.config.*`, `ai-i18n.config.ts`, entries and current imports. Preserve its package manager, framework plugin order, and existing choices. Target Node.js 22.13+ and Vite 8+. Select one Vite app and one ai-i18n directory; ask only if several targets are equally plausible.

Register one `aiI18n()` plugin. Default `t('原文')` is global; use `t('原文', { comment: '语境' })` for a distinct global identity and `{ scope: 'file' }` only when that file needs a separate translation. Comment has no runtime effect other than identity and does not fall back to the unqualified translation. File scope falls back to the corresponding global identity, then source.

`ai-i18n.config.ts` may supply an optional async `adapter(catalog)` for Build and explicit scan. It receives the full active catalog and returns locale→key→string/null or `null`; results are one-time. Committed manual input lives in `i18n/locales/*.manual.json` and `i18n/locales/files/*.manual.json`. Generated `locales/` is the final resource. Read [configuration and migration](references/configuration.md) before changing existing storage or configuration.

Dev transforms runtime calls and loads existing resources. It does not scan the full app, call the adapter, or write translation data. Run Build or explicit `ai_i18n_scan_project` after source or manual translation changes. Use the `use-ai-i18n-mcp` Skill for Agent translation work.

If interactive Review is requested, register `aiI18nReview()` beside `aiI18n()`. Review edits manual input; a scan or Build refreshes final resources.

Verify relevant Vanilla, Vue or React calls, language switching, async file packets, and type/lint/build checks. On migration, run a complete scan before accepting removal of old `extracted/`, `translations/`, and `overrides/`; unresolved overrides must remain available for manual repair.
