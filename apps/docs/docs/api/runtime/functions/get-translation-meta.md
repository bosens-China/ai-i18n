---
title: getTranslationMeta()
description: 读取当前应用的公开译文元数据
---

```ts
import { getTranslationMeta } from 'virtual:ai-i18n';

function getTranslationMeta(): TranslationMeta | undefined;
```

返回当前已应用快照的公开元数据，只读且在运行时递归冻结。新快照成功应用时一起更新，
不表示服务器此刻的最新版本。没有元数据、Dev 尚未加载、SSR 降级与 Vitest 专用 Runtime
返回 `undefined`。

该函数返回调用时快照，不自动建立框架响应式依赖，也不在自动导入集合中。

`TranslationMeta` 是 `@ai-i18n/vite/runtime` 导出的类型，可以通过同入口的
`Register.translationMeta` 注册。设置元数据与注册示例见
[远程文案与译文](/guide/advanced/remote-translations)。
