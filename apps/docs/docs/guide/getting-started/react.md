---
title: React 快速上手
description: 从 create-vite 创建 React 项目，并完成 ai-i18n 配置、翻译与 Build 验证
---

## 开始前

ai-i18n 要求 Vite 8 或更高版本，并且当前只支持浏览器端应用。需要 SSR、按请求选择语言或避免首屏
源码回退的项目，暂不适合接入当前版本。

## 创建项目

下面以 pnpm 和 Vite 的 `react-ts` 模板为例：

```sh
pnpm create vite ai-i18n-react --template react-ts
cd ai-i18n-react
pnpm install
pnpm add @ai-i18n/vite@alpha
```

项目尚未发布正式版。正式版发布前请保留 `@alpha`，避免安装到较旧的 `latest`。

已有 Vite + React 项目可以跳过创建步骤，直接安装 `@ai-i18n/vite@alpha`。请保留现有的
React Vite 插件，无需安装额外的 ai-i18n React 适配包。

## 配置 Vite

在 `vite.config.ts` 中注册 `aiI18n()`：

```ts
import { aiI18n } from '@ai-i18n/vite';
import react from '@vitejs/plugin-react';
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
    react(),
  ],
});
```

ai-i18n 会从最终的 Vite 插件列表识别 React 模式。只有自定义插件环境无法识别时，才需要
显式设置 `framework: 'react'`。

## 编写第一个翻译组件

将 `src/App.tsx` 替换为：

```tsx
import { useI18n } from 'virtual:ai-i18n';

export default function App() {
  const { currentLang, langs, setLang, t } = useI18n();

  async function changeLanguage(value: string) {
    try {
      await setLang(value);
    } catch {
      // 切换失败时保留当前语言；完整项目可显示 langLoadState 中的错误。
    }
  }

  return (
    <main>
      <p>{t('保存')}</p>
      <select
        value={currentLang}
        onChange={(event) => void changeLanguage(event.target.value)}
      >
        {langs.map((lang) => (
          <option key={lang.value} value={lang.value}>
            {lang.label}
          </option>
        ))}
      </select>
    </main>
  );
}
```

组件需要展示随语言变化的文案时，应使用 `useI18n()` 返回的 `t`。不要在渲染路径中只调用
Runtime 顶层 `t`，否则组件不会建立订阅。

## 运行与验证

```sh
pnpm dev
pnpm build
```

打开开发页面后切换语言。缺少目标译文时，`t()` 会先回退源码文案。首次接入后执行完整
Build，确认入口可达源码均已提取，并检查以下文件：

```text
src/ai-i18n.d.ts
i18n/translations.json
i18n/overrides.json
i18n/extracted/
i18n/locales/
```

应提交前三类声明或权威译文文件，忽略可重新生成的 `extracted/` 与 `locales/`。完整规则见
[生成文件与 Git](/guide/basic/directory)。

## 接入 UI 组件库

ai-i18n 负责业务文案，组件库内置文案仍由组件库自己的 locale 控制。常见组件库都可以从
`currentLang` 派生 locale，再传给根部 Provider：

| 组件库     | Provider         | Locale 模块            |
| ---------- | ---------------- | ---------------------- |
| Ant Design | `ConfigProvider` | `antd/locale/*`        |
| MUI        | `ThemeProvider`  | `@mui/material/locale` |

以 Ant Design 为例：

```tsx
import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import type { PropsWithChildren } from 'react';
import { useI18n } from 'virtual:ai-i18n';

export function AppLocale({ children }: PropsWithChildren) {
  const { currentLang } = useI18n();
  const locale = currentLang === 'en-US' ? enUS : zhCN;

  return <ConfigProvider locale={locale}>{children}</ConfigProvider>;
}
```

MUI 使用 `createTheme({}, locale)` 创建本地化主题，再交给 `ThemeProvider`。MUI X Date
Pickers 还需同步日期适配器的 locale。

## 下一步

- [React 常见问题](/guide/faq/react)：排查 JSX 提取、组件订阅与 React Compiler。
- [自动导入](/guide/basic/auto-import)：显式开启后省略 `useI18n` import。
- [React 在线演示](/demo/react)：查看可交互的完整示例。
