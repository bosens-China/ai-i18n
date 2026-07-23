---
title: 快速上手
description: 在 Vite 8 项目中安装并运行 ai-i18n
---

面向 Vite 8 的浏览器端 AI 国际化插件。源码只写显式 `t()`。插件在 Dev 与 Build
期间静态提取文案，可选调用 Provider，并维护可提交 Git 的 Translation Memory。

## 适用边界

开始前请先确认以下前提：

- 只支持 **Vite 8** 与 **浏览器 Runtime**。SSR 会跳过注入，并给出诊断。
- 只识别显式 `t()`，不会自动扫描普通字符串、JSX 文本或 Vue 模板文本。
- 每个 Vite build **只能一种框架模式**：`vanilla`、`vue` 或 `react`。
- 不提供独立 CLI。流程由 `vite dev` / `vite build` 驱动。

## 安装

```sh
pnpm add @boses/vite
```

当前处于 `1.0.0-alpha` 时，请按发布说明使用对应 dist-tag。

## 最小配置

```ts
// vite.config.ts
import { aiI18n } from '@boses/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
  ],
});
```

## 第一句翻译

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n';

console.log(t('保存', '按钮'));
console.log(getLangs());
await setLang('en-US');
```

第二个参数是可选注释，会参与 message ID。相同源文案、不同注释视为不同条目。

## 下一步

1. 按框架继续阅读 [框架上手](/frameworks/)。
2. 了解产物目录与提交约定，见 [文件与工作流](/workflow/)。
3. 需要自动翻译时，接入 [AI 翻译](/ai-translation/)。
4. 需要 Agent 补译时，见 [AI 工具接入](/ai-tools/)。
