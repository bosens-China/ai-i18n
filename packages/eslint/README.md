# @ai-i18n/eslint-plugin

用于提前报告无法被 Vite/Yuku 静态提取的 `t()` 参数。规则检查解析到
`virtual:ai-i18n` 的 `t` binding，以及 Vue/React `useI18n()` 解构得到的 `t`，
不会处理其他库或局部同名函数。

```js
import aiI18n from '@ai-i18n/eslint-plugin'

export default [
  ...aiI18n.configs.recommended,
]
```

需要解析 `tsconfig` 路径别名时，可以显式配置规则：

```js
import aiI18n from '@ai-i18n/eslint-plugin'

export default [
  {
    plugins: { 'ai-i18n': aiI18n },
    rules: {
      'ai-i18n/t-static-args': ['error', {
        tsconfigPath: './tsconfig.json',
      }],
    },
  },
]
```

插件不会自动修改宿主 ESLint 配置。
