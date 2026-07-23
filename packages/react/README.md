# @ai-i18n/react

ai-i18n 的 React binding，使用 `useSyncExternalStore` 跟踪语言与翻译变化。

```tsx
import { useI18n } from '@ai-i18n/react';

const { t, setLang, currentLang, langs } = useI18n();
```

需要静态提取时，项目还应安装 `@ai-i18n/vite` 和 Vite 8，并在主插件中组合
`@ai-i18n/react/vite` 导出的 `react()`。注册后 Hook binding 同时适用于 JS、TS、JSX、TSX，
因此普通 `.ts` custom Hook 也会提取；支持解构 alias 和 `i18n.t()` 成员调用。纯浏览器入口
不会加载 Vite/Yuku。

React JSX 与 Vue JSX 可以存在于同一项目，文件不需要框架后缀。混合构建中可让 React
处理未被 Vue JSX `include` glob 命中的文件；单个文件不能混用两种 JSX Runtime。
