---
title: Vanilla 快速上手
description: 在 Vite Vanilla TypeScript 项目中安装 ai-i18n 并完成首次翻译
---

## 开始前

ai-i18n 要求 Vite 8 或更高版本，并且当前只支持浏览器端应用。需要 SSR、按请求选择语言或避免首屏
源码回退的项目，暂不适合接入当前版本。

## 创建项目

下面以 pnpm 和 TypeScript 模板为例：

```sh
pnpm create vite ai-i18n-vanilla --template vanilla-ts
cd ai-i18n-vanilla
pnpm install
pnpm add @ai-i18n/vite@alpha
```

项目尚未发布正式版。正式版发布前请保留 `@alpha`，避免安装到较旧的 `latest`。

已有 Vite 项目可以跳过创建步骤，直接安装 `@ai-i18n/vite@alpha`。

## 配置 Vite

在 `vite.config.ts` 中注册 `aiI18n()`。没有检测到 Vue 或 React Vite 插件时，插件自动使用
Vanilla 模式：

```ts
import { aiI18n } from '@ai-i18n/vite';
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

## 翻译并更新 DOM

从虚拟模块导入 Runtime API。Vanilla 模式需要在语言变化后主动更新 DOM：

```ts
import { getLangs, setLang, subscribe, t } from 'virtual:ai-i18n';

function render() {
  document.querySelector('#app')!.textContent = t('保存');
}

render();
const unsubscribe = subscribe(render);

console.log(getLangs());
await setLang('en-US');

window.addEventListener('pagehide', () => unsubscribe(), { once: true });
```

## 运行与验证

```sh
pnpm dev
pnpm build
```

Dev 只提取浏览器实际请求过的模块。首次接入后应执行一次完整 Build，确认入口可达源码均已
提取。生成文件及 Git 提交规则见[生成文件与 Git](/guide/basic/directory)。

## 下一步

- [保存语言偏好](/api/vite/interfaces/ai-i18n-persist-options)：按需使用 localStorage 记住用户选择。
- [测试（Vitest）](/guide/quality/testing)：使用专用内存 Runtime 测试业务模块。
- [通用文案写法](/guide/basic/static-analysis/common)：处理动态值、文案集合和业务枚举。
