# 子包与路径解析

## Monorepo 子包

被应用消费的本地源码子包不需要再次注册 `@ai-i18n/vite`。仓库根 ESLint 配置已经覆盖
`packages/**` 时，只在根配置引入一次与消费应用一致的 preset；子包拥有独立
`eslint.config.*` 或独立 lint 命令时，也必须引入该 preset，并确保
`@ai-i18n/eslint-plugin` 能从该配置解析到。

应用私有子包使用自动导入时，选择与消费它的 Vite build 相同的 `*-auto-import` preset，
并让子包 TypeScript 项目包含该 build 生成的 dts。会被多个应用复用的子包优先显式导入
`virtual:ai-i18n`，使用显式导入 preset，避免依赖单个应用的全局声明。

## alias、tsconfig 与 jsconfig

`settings['ai-i18n'].alias` 拥有最高解析优先级。纯 JavaScript 项目可以与 Vite 共享同一个
本地源码 alias 对象，无需为了 ESLint 额外创建 `tsconfig.json`：

```js
// aliases.js
import { fileURLToPath } from 'node:url';

export const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import { alias } from './aliases.js';

export default defineConfig({ resolve: { alias } });
```

```js
// eslint.config.js
import aiI18n from '@ai-i18n/eslint-plugin';
import { alias } from './aliases.js';

export default [
  ...aiI18n.configs.recommended,
  {
    settings: {
      'ai-i18n': { alias },
    },
  },
];
```

第一版只承诺字符串到字符串的对象形式。replacement 必须使用绝对路径，并指向项目本地源码。
Vite 的数组形式、正则 `find`、`customResolver` 与 resolver plugin 不在支持范围内。插件不会
加载或执行 `vite.config.*`。

显式 alias 未匹配当前导入时，静态分析规则从 importer 向上寻找最近的 `tsconfig.json` 或
`jsconfig.json`；同一目录同时存在两者时优先使用 `tsconfig.json`。插件解析 `extends`，
递归读取 `references`，再按 importer 是否满足各项目的 `files`、`include`、`exclude`
选择实际配置。因此常见的 `@/*` paths alias 不需要额外选项。Vue 文件必须由项目显式包含，
例如 `include: ['src/**/*.ts', 'src/**/*.vue']`。

`tsconfigPath` 是自动发现入口的可选覆盖项，适用于非标准配置名或希望固定从某个 solution
config 开始解析的项目。相对路径按 ESLint 进程的工作目录解析；指向带 `references` 的根
配置后，仍会执行相同的递归与项目选择逻辑。该选项沿用现有名称，也可以直接指向
`jsconfig.json`。

TypeScript 6 的编译器仍执行已有的 `baseUrl` 解析，但会报告弃用诊断；TypeScript 7 将
不再支持该选项。插件兼容 TypeScript 5/6 的 `baseUrl + paths`；新项目推荐省略
`baseUrl`，写成 `"paths": { "@/*": ["./src/*"] }`。若旧项目还依赖 `baseUrl` 的未匹配
bare import 查找，则用 `"*": ["./src/*"]` 显式保留。只存在于 Vite `resolve.alias`
的别名应通过共享对象传入 `settings['ai-i18n'].alias`。

需要覆盖自动发现入口时，可以显式配置规则：

```js
import aiI18n from '@ai-i18n/eslint-plugin';

export default [
  {
    languageOptions: {
      globals: {
        t: 'readonly',
        setLang: 'readonly',
        getLang: 'readonly',
        getLangs: 'readonly',
        getLangLoadState: 'readonly',
        subscribe: 'readonly',
        useI18n: 'readonly',
        tRef: 'readonly',
        i18nComputed: 'readonly',
        tComputed: 'readonly',
        defineI18nMessages: 'readonly',
      },
    },
    plugins: { 'ai-i18n': aiI18n },
    rules: {
      'ai-i18n/no-embedded-markup': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
      'ai-i18n/no-eager-translation': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          framework: 'vue',
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
      'ai-i18n/no-unsubscribed-t': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          framework: 'vue',
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
      'ai-i18n/no-unsubscribed-runtime-state': [
        'warn',
        {
          autoImport: ['getLang', 'getLangLoadState', 'i18nComputed'],
          framework: 'vue',
        },
      ],
      'ai-i18n/static-candidate-limit': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
          maxStaticCandidates: 2_000,
        },
      ],
      'ai-i18n/t-static-args': [
        'error',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
      'ai-i18n/no-redundant-auto-import': [
        'warn',
        {
          autoImport: [
            'useI18n',
            't',
            'setLang',
            'getLang',
            'getLangs',
            'getLangLoadState',
            'subscribe',
            'tRef',
            'i18nComputed',
            'tComputed',
          ],
        },
      ],
    },
  },
];
```

上例匹配 Vue 模式；React 应移除 `tRef`、`i18nComputed` 与 `tComputed`，Vanilla 再移除
`useI18n`。翻译静态分析规则的 `autoImport` 只列 `t`、`tRef`、`tComputed` 与
`useI18n`，状态快照规则只列 `getLang` 与 `getLangLoadState`。日常接入优先使用预设，
避免 Vite 与 ESLint 的 API 集合不一致。

`ai-i18n/static-candidate-limit` 默认在单个 `t()` 的 source 与 options 组合超过 1000 个
时警告。`maxStaticCandidates` 必须是正整数，只改变 ESLint 的提示阈值；Vite 提取不设
上限，也没有对应插件选项。

插件不会自动修改宿主 ESLint 配置。

诊断默认按当前 Node locale 选择语言：中文 locale 使用中文，其他 locale 回退英文。设置
`AI_I18N_DIAGNOSTIC_LOCALE=zh-CN` 或 `en-US` 可以固定语言，`auto` 恢复自动检测。
