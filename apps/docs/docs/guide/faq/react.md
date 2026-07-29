---
title: React 常见问题
description: 排查 React JSX 提取、语言切换订阅、顶层 t 与 React Compiler 问题
---

## 为什么普通 JSX 文本没有被提取？

ai-i18n 不猜测普通 UI 文本。把需要翻译的文本放入 `useI18n()` 返回的 `t()`：

```tsx
import { useI18n } from 'virtual:ai-i18n';

function SaveButton() {
  const { t } = useI18n();
  return <button>{t('保存')}</button>;
}
```

支持的静态表达式、文案树与限制见 [React 静态分析](/guide/basic/static-analysis/react)。

## 为什么切换语言后组件没有刷新？

组件渲染必须调用 `useI18n()` 返回的 `t`。从 `virtual:ai-i18n` 单独导入的顶层 `t` 只读取
当前语言，不会让组件订阅后续更新。

也不要把 `t('保存')` 的结果放入模块常量或长期 state。保留 source 文案，在每次渲染时调用
Hook 返回的 `t()`。

## React Compiler 能否替代 `useI18n()`？

不能。React Compiler 可以缓存渲染计算，但不会为 Runtime 顶层 `t` 自动建立外部状态订阅。
`useI18n()` 内部使用 `useSyncExternalStore`，Runtime 更新时还会刷新 `t` 的函数引用，因此
无论是否启用 React Compiler，组件渲染都应使用 Hook 返回的 `t`。

## 普通工具模块不能调用 Hook，应该怎么翻译？

普通 `.js` 或 `.ts` 工具模块可以导入 Runtime 顶层 `t`，但应在实际调用时翻译：

```ts
import { t } from 'virtual:ai-i18n';

export const getRetryMessage = () => t('请重试');
```

不要导出 `const retryMessage = t('请重试')`，它只保存模块初始化时的译文快照。组件渲染仍
使用 `useI18n()`。

## 本地 link 后为什么出现 Invalid Hook Call？

先确认应用只解析到一份 `react` 和 `react-dom`。本地工作区或 link 场景可在 Vite 中添加：

```ts
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
```

正常安装通常由 peer dependency 复用应用自己的 React，不需要额外配置。
