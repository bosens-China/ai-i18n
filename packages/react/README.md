# @ai-i18n/react

ai-i18n 的 React binding，使用 `useSyncExternalStore` 跟踪语言与翻译变化。

```tsx
import { useI18n } from '@ai-i18n/react'

const { t, setLang, currentLang, langs } = useI18n()
```

需要静态提取 JSX/TSX 时，项目还应安装 `@ai-i18n/vite` 和 Vite 8，并在主插件中组合
`@ai-i18n/react/vite` 导出的 `react()`。纯浏览器入口不会加载 Vite/Yuku。
