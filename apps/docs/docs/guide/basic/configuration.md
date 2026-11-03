---
title: 独立配置与多应用
description: 使用 ai-i18n.config.ts 配置应用，并在 monorepo 中区分不同应用
---

每个应用使用一份 `ai-i18n.config.ts`，Vite 中只注册插件。项目配置按 ESM 加载；使用 `.ts` 时，在应用 `package.json` 中设置 `"type": "module"`。

```ts title="ai-i18n.config.ts"
import { defineConfig } from '@ai-i18n/vite/config';

export default defineConfig({
  sourceLang: 'zh',
  locales: [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ],
});
```

```ts title="vite.config.ts"
import { defineConfig } from 'vite';
import { aiI18n } from '@ai-i18n/vite';

export default defineConfig({ plugins: [aiI18n()] });
```

保留项目已有的 Vue、React 等插件。业务配置字段见 [AiI18nOptions](/api/vite/interfaces/ai-i18n-options)。`defineConfig` 接受配置对象，或同步/异步的 `({ command, mode }) => ({ ... })` 配置函数；Dev、Build 和工具应使用相同的目标环境。

## 查找与路径

- `aiI18n()` 默认读取 Vite root 下的 `ai-i18n.config.ts`；找不到时明确报错，不回退为空配置。
- 可通过 `aiI18n({ configFile: '../ai-i18n.config.ts' })` 指定文件，此路径相对于 Vite root，绝对路径保持不变。
- 独立配置中的 `root` 默认是配置文件所在目录。Vite 使用其他 root 时，显式设置该字段，两边最终必须指向同一目录。
- `directory` 默认是配置旁的 `i18n/`；`dts` 默认是配置旁的 `src/ai-i18n.d.ts`。Provider 日志与性能报告目录也以配置目录为基准。
- `root`、`directory`、`dts` 和日志路径不会随着命令的工作目录改变。源码引用位置仍然相对于 Vite root。
- 通过普通 TS import 复用语言列表或适配器。不存在父目录配置自动继承或多份配置自动合并。

例如，配置位于应用目录，但 Vite root 为 `client/`：

```ts title="ai-i18n.config.ts"
import { defineConfig } from '@ai-i18n/vite/config';

export default defineConfig({
  root: './client',
  directory: './i18n',
  dts: './client/src/ai-i18n.d.ts',
  sourceLang: 'zh',
  locales: [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ],
});
```

Vite 中设置 `root: './client'` 并注册 `aiI18n({ configFile: '../ai-i18n.config.ts' })`。Dev 修改配置或它导入的本地文件会重启，扫描缓存也会失效。

## Monorepo

```text
apps/
├── web/
│   ├── ai-i18n.config.ts
│   ├── vite.config.ts
│   └── i18n/
└── admin/
    ├── ai-i18n.config.ts
    ├── vite.config.ts
    └── i18n/
```

工作区检索会发现两个应用。选择其中一个后才加载其配置，不会执行所有候选配置，也不会自动合并或批量修改。依赖、隐藏目录、常见构建产物和符号链接不参与检索。自定义文件名或被排除目录中的配置可以显式选择。

共享源码包的文案属于使用它的应用，无需额外创建配置。各应用继续使用独立翻译目录。

## 从内联配置迁移

将 `aiI18n({ ... })` 中的业务配置移入 `ai-i18n.config.ts` 的 `defineConfig({ ... })`，原位置改为 `aiI18n()`。Provider、SQLite 和远程适配器的相关 import 一并移动，Review 仍在 Vite 中单独注册。

这是不兼容变更，不合并新旧配置。配置放在原 Vite root 时，默认翻译目录保持原位置；放在其他位置时，先显式设置 `directory` 指向现有目录，避免误建一套空译文。无需转换 `translations` 或 `overrides` 文件格式。
