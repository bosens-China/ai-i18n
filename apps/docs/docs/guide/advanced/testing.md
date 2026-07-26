---
title: 测试（Vitest）
description: 使用 aiI18nVitest() 在 Vitest 中提供 virtual:ai-i18n，无需手写 alias/mock，也不读写协议文件
---

单元测试通常不需要静态提取、Provider 调用或 `i18n/` 协议文件读写——这些正是正式 `aiI18n()`
插件承担的构建期工作。继续在 `vitest.config.ts` 里注册 `aiI18n()`，或者手写 alias 把
`virtual:ai-i18n` 指向自建 mock，都容易遇到问题：前者会触发 registration 静态依赖加载与文件
系统写入（Windows 下尤其容易因路径问题报错），后者需要自己维护 `t`/`useI18n` 的签名，插件升级
后 mock 很容易过期。

`@ai-i18n/vite/vitest` 导出的 `aiI18nVitest()` 提供一个只驻留在内存里的测试期 Runtime：解析
`virtual:ai-i18n` 时复用与生产环境相同的 Runtime 生成逻辑，但不提取翻译、不调用 Provider、
也不接触磁盘上的任何协议文件。

测试插件仍会执行 `defineI18nMessages()` 的编译期消除，因此使用消息集合宏的业务模块无需
额外 mock 或 import。它只做宏转换，不在测试期间生成提取文件。
不经过 Vite 转换的 Jest、直接 Node 执行等环境不会识别该宏，需要改用
`aiI18nVitest()`，或避免执行包含宏的源码。

## 快速开始

```ts
// vitest.config.ts
import { aiI18nVitest } from '@ai-i18n/vite/vitest';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    aiI18nVitest({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
    react(),
  ],
});
```

Vue 项目把 `react()` 换成 `vue()`，`framework` 同样按最终插件列表自动检测（`vite:vue`/
`vite:vue-jsx` → `vue`，`vite:react*` → `react`，都不存在 → `vanilla`）；也可以显式传
`framework` 覆盖检测结果。

## 与正式配置共享 options

`AiI18nVitestOptions` 是 `AiI18nOptions` 的子集，只保留 `sourceLang`、`defaultLang`、
`locales`、`framework`、`persist`、`detect`、`fallback`。把这部分抽成共享文件，`vite.config.ts`
与 `vitest.config.ts` 各自引用，语言列表和运行时策略只需要改一处：

```ts
// ai-i18n.options.ts
export const aiI18nOptions = {
  sourceLang: 'zh-CN',
  defaultLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
  persist: { key: 'app-lang' },
  detect: 'navigator',
} as const;
```

```ts
// vite.config.ts
import { aiI18n } from '@ai-i18n/vite';
import { aiI18nOptions } from './ai-i18n.options';

export default defineConfig({
  plugins: [aiI18n(aiI18nOptions), react()],
});
```

```ts
// vitest.config.ts
import { aiI18nVitest } from '@ai-i18n/vite/vitest';
import { aiI18nOptions } from './ai-i18n.options';

export default defineConfig({
  plugins: [aiI18nVitest(aiI18nOptions), react()],
});
```

`html`、`loading`、`cache`、`translator`、`provider`、`directory`、`dts` 等构建期字段不属于
`AiI18nVitestOptions`；直接把完整的 `aiI18n()` 配置对象传给 `aiI18nVitest()` 会被 TypeScript
拒绝多余字段，按需只挑测试需要的子集传入即可。

## 测试环境的能力范围

| 能力                        | 测试环境行为                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `t(source)` / `` t`...` ``  | 可用。测试 Runtime 没有加载任何目标语言译文，返回值始终遵循 `fallback` 策略。                            |
| `setLang(value)`            | 可用，可用于测试语言切换触发的重渲染、`persist` 写入 localStorage、`detect` 探测逻辑。                   |
| `useI18n()`                 | Vue / React 模式下可用，Hook 行为与生产环境一致（`t` 的引用会随语言/Runtime 版本变化）。                 |
| 静态提取 / `i18n/` 协议文件 | 不会发生，不会创建、读取或修改 `translations.json`、`overrides.json`、`extracted/*.json`、`locales/**`。 |
| Provider / AI 自动翻译      | 不会调用；`translator`、`provider` 不属于 `AiI18nVitestOptions`。                                        |

由于没有加载任何目标语言译文，`fallback` 策略决定了测试里能看到的文案：

- 默认 `fallback: 'source'`：`t('保存')` 始终返回 `"保存"`，即使调用过
  `await setLang('en-US')` 之后也是如此。可以把这类测试理解为契约测试——只断言组件确实调用了
  `t()` 并渲染出结果，不断言具体译文内容。
- 需要验证 UI 在漏译场景下的表现（例如确认不会渲染出 `null` 或崩溃）时，传入
  `fallback: 'marked'`，`t()` 会返回 `⟦保存⟧` 这样的标记文本，方便在测试断言或快照里识别。

具体译文是否正确（例如 `en-US` 有没有翻译成 `"Save"`）属于协议文件的职责，不应该在单测里断言。
这类校验交给 [AI 翻译](/guide/advanced/ai-translation) 的 Provider 流程或人工检查
`i18n/locales/en-US.json`；也可以在 CI 里额外跑一次真实的 `vite build`（使用正式 `aiI18n()`）
作为集成校验。

## 常见问题

**测试环境需要先跑过 `vite build` 或存在 `i18n/translations.json` 吗？**
不需要。`aiI18nVitest()` 完全独立于协议目录，即使协议文件还不存在也能正常解析
`virtual:ai-i18n`。

**能不能在同一个 `vitest.config.ts` 里同时注册 `aiI18n()` 和 `aiI18nVitest()`？**
不要这样做。两者都会尝试解析 `virtual:ai-i18n`，只注册 `aiI18nVitest()` 即可。

**端到端测试（Playwright 等）呢？**
`aiI18nVitest()` 只覆盖 Vitest 场景。端到端测试应该跑真实的 `vite dev` / `vite build`，
走正式的协议文件和翻译内容，才能覆盖到实际的翻译效果。
