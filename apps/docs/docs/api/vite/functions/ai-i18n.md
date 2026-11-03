---
title: aiI18n()
description: 创建 ai-i18n 的 Vite 插件
---

从 `@ai-i18n/vite` 导入：

```ts
import { aiI18n } from '@ai-i18n/vite';
```

## 签名

```ts
function aiI18n(options?: { configFile?: string }): Plugin;
```

业务配置放在独立的 `ai-i18n.config.ts`，见[独立配置与多应用](/guide/basic/configuration)。`aiI18n()` 返回一个 Vite 插件。每个 Vite build 只应注册一次。

## 示例

```ts
import { aiI18n } from '@ai-i18n/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [aiI18n()],
});
```

```ts title="ai-i18n.config.ts"
import { defineConfig } from '@ai-i18n/vite/config';

export default defineConfig({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
});
```

配置完成后，业务代码从 `virtual:ai-i18n` 导入 Runtime API：

```ts
import { setLang, t } from 'virtual:ai-i18n';
```

## 参数

| 参数                 | 类型     | 说明                                 |
| -------------------- | -------- | ------------------------------------ |
| `options.configFile` | `string` | 可选配置文件路径，相对于 Vite root。 |

## 返回值

返回 Vite 的 `Plugin` 对象。插件负责静态提取、协议文件同步、可选 Provider 调度、虚拟
Runtime 和声明文件生成。

## 相关内容

- [Vue 快速上手](/guide/getting-started/vue)
- [React 快速上手](/guide/getting-started/react)
- [Vanilla 快速上手](/guide/getting-started/vanilla)
- [通用文案写法](/guide/basic/static-analysis/common)
- [生成文件与 Git](/guide/basic/directory)
