---
title: ESLint 9
description: '@ai-i18n/eslint-plugin 的 Flat Config、预设、规则与选项'
---

`@ai-i18n/eslint-plugin` 面向 ESLint 9 Flat Config。它在 lint 阶段复用 ai-i18n 的静态分析语义，
提前报告无法被 Vite 提取的 `t()` 参数。

## 安装

```sh
pnpm add -D eslint @ai-i18n/eslint-plugin
```

Vue SFC 还需要宿主已有的 `eslint-plugin-vue`、`vue-eslint-parser` 与
`@vue/compiler-sfc`。

## 显式导入

未启用 ai-i18n 按需导入时，使用 `recommended`：

```js
// eslint.config.mjs
import aiI18n from '@ai-i18n/eslint-plugin';
import { defineConfig } from 'eslint/config';

export default defineConfig([...aiI18n.configs.recommended]);
```

该预设启用 `ai-i18n/t-static-args`，并忽略 `.vue` 文件。它只检查实际绑定到
`virtual:ai-i18n` 的 `t`。

## 按需导入

按 Vite 的最终框架模式选择一个预设：

```js
// eslint.config.mjs
import aiI18n from '@ai-i18n/eslint-plugin';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...aiI18n.configs.vanilla, // 或 .vue / .react
]);
```

| 预设              | 文件范围                  | 声明的只读全局                                     |
| ----------------- | ------------------------- | -------------------------------------------------- |
| `configs.vanilla` | JS / TS                   | `t`、`setLang`、`getLang`、`getLangs`、`subscribe` |
| `configs.vue`     | JS / TS / JSX / TSX / Vue | `useI18n`                                          |
| `configs.react`   | JS / TS / JSX / TSX       | `useI18n`                                          |

这些预设只负责 ai-i18n 的 API。`unplugin-auto-import` 管理的其他全局仍由它自己的
ESLint 集成负责。

## Vue Flat Config

先配置宿主 Vue parser，再追加 ai-i18n 预设：

```js
// eslint.config.mjs
import aiI18n from '@ai-i18n/eslint-plugin';
import pluginVue from 'eslint-plugin-vue';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  ...aiI18n.configs.vue,
]);
```

## 手工配置规则

需要修改规则选项时，在 Flat Config 的 `plugins` 中注册插件对象：

```js
// eslint.config.mjs
import aiI18n from '@ai-i18n/eslint-plugin';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    plugins: {
      'ai-i18n': aiI18n,
    },
    rules: {
      'ai-i18n/t-static-args': [
        'error',
        {
          autoImport: true,
          tsconfigPath: './tsconfig.json',
        },
      ],
    },
  },
]);
```

### `t-static-args` 选项

| 选项           | 类型      | 必填 | 默认值          | 作用                                        |
| -------------- | --------- | ---- | --------------- | ------------------------------------------- |
| `autoImport`   | `boolean` | 否   | `false`         | 检查未显式导入、由 ai-i18n 注入的全局 API。 |
| `tsconfigPath` | `string`  | 否   | 不读取 tsconfig | 解析 TypeScript `paths` alias。             |

插件不会自动修改宿主 ESLint 配置，也不会生成或更新 `i18n/` 协议文件。
