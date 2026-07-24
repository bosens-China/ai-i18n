---
title: 快速上手
description: 在 Vite 8 项目中安装 ai-i18n，并选择显式导入或按需导入
---

ai-i18n 在 Vite Dev 与 Build 期间提取显式 `t()`，维护可提交到 Git 的翻译文件，
并向浏览器提供切换语言所需的 Runtime。

## 开始前

- 使用 Vite 8 和浏览器 Runtime。SSR 会跳过注入并给出诊断。
- 每个 Vite build 只选择一种模式：`vanilla`、`vue` 或 `react`。
- 插件只识别显式 `t()`，不会猜测普通字符串、JSX 文本或 Vue 模板文本。
- 流程由 `vite dev` 或 `vite build` 驱动，不需要单独执行 CLI。

## 1. 安装

```sh
pnpm add @boses/vite
```

Vue 或 React 项目继续使用原有的 Vite 框架插件，不需要额外安装 ai-i18n 框架包。

## 2. 注册 Vite 插件

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

`sourceLang` 与 `locales` 必填。`sourceLang` 必须出现在 `locales` 中；省略
`defaultLang` 时，Runtime 默认使用 `sourceLang`。

## 3. 写第一句翻译

先使用显式导入确认接入成功：

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n';

console.log(t('保存', '按钮'));
console.log(getLangs());
await setLang('en-US');
```

`comment` 是可选的第二个参数，用于解决同一文案在不同场景中的歧义。不同
`source + comment` 会生成不同 message ID。

## 4. 选择按需导入

显式导入已经覆盖完整功能。希望省略 import 时，有两种接入方式。

### 只为 ai-i18n 开启

如果项目不需要其他自动导入插件，直接设置：

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  autoImport: true,
});
```

ai-i18n 会分析未绑定的 API 调用，并从 `virtual:ai-i18n` 注入实际 import。

### 复用 `unplugin-auto-import`

如果项目已经使用或准备使用 `unplugin-auto-import`，先安装并注册：

```sh
pnpm add -D unplugin-auto-import
```

```ts
// vite.config.ts
import { aiI18n } from '@boses/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales,
    }),
    AutoImport({
      imports: [
        // 这里只配置其他库，不要重复填写 ai-i18n API。
      ],
    }),
  ],
});
```

ai-i18n 会检测最终插件列表并自动开启按需导入。`unplugin-auto-import` 只是启用信号；
ai-i18n 自己负责注入 `virtual:ai-i18n`。

| 模式    | 无需 import 时可直接调用                           |
| ------- | -------------------------------------------------- |
| Vanilla | `t`、`setLang`、`getLang`、`getLangs`、`subscribe` |
| Vue     | `useI18n`                                          |
| React   | `useI18n`                                          |

需要强制关闭时设置 `autoImport: false`。显式导入始终可用。

## 5. 检查 TypeScript 声明

插件默认生成 `src/ai-i18n.d.ts`。它声明 `virtual:ai-i18n`，并在开启按需导入时声明对应
全局 API。请确认该路径包含在项目的 TypeScript 检查范围内。

```json
{
  "include": ["src"]
}
```

需要修改路径时使用 `dts: 'types/ai-i18n.d.ts'`。只有在其他地方维护了等价声明时，
才设置 `dts: false`。生成文件由插件维护，请勿手工编辑。

## 6. 验证输出

运行开发服务器并访问包含 `t()` 的页面，或执行一次生产构建：

```sh
pnpm dev
# 或
pnpm build
```

默认会生成：

```text
i18n/
├── cache.json
├── extracted/
└── locales/
```

Dev 只提取浏览器实际请求到的模块。验证懒加载页面时，请先访问对应路由。

## 可选：ESLint 9 检查

需要在提交前发现动态参数或为按需导入声明 lint 全局时，接入
[ESLint 9 Flat Config](./eslint/)。

## 下一步

1. 阅读[框架上手](../frameworks/)，选择 Vue、React 或 Vanilla 的组件写法。
2. 阅读[文件与工作流](../workflow/)，了解 Git 提交约定。
3. 需要模型自动补译时，继续阅读 [AI 翻译](../ai-translation/)。
4. 所有字段和函数签名见[配置与 API](../api/)。
