---
title: RemoteAdapter
description: 自定义远程提交、译文快照与公开元数据契约
---

从 `@ai-i18n/vite/remote` 导入 `defineRemote` 与以下类型，不需要安装额外 npm 包。

```ts
function defineRemote(adapter: RemoteAdapter): RemoteAdapter;

interface RemoteAdapter {
  mode?: 'replace' | 'overlay';
  publish?(context: RemoteContext): Promise<void>;
  load?(context: RemoteContext): Promise<RemoteSnapshot>;
}

interface RemoteContext {
  readonly command: 'serve' | 'build';
  readonly sourceLang: string;
  readonly locales: readonly string[];
  readonly messages: readonly Readonly<RemoteMessage>[];
  readonly signal: AbortSignal;
}

interface RemoteMessage {
  source: string;
  comment?: string;
  readonly occurrences: readonly Readonly<{
    file: string;
    line: number;
    column: number;
  }>[];
}

interface RemoteSnapshot {
  readonly translations: readonly RemoteTranslation[];
  readonly publicMeta?: TranslationMeta;
}

interface RemoteTranslation {
  readonly message: { source: string; comment?: string };
  readonly locale: string;
  readonly value: string | null;
}
```

- 至少提供一个操作；两者同时提供时先提交后获取。`load` 与 `provider` 互斥。
- `mode` 默认为 `replace`；`overlay` 必须提供 `load`，其有效值优先于本地人工和自动译文。
- `messages` 按 source + comment 去重；`occurrences` 提供相对当前 Vite root 的 POSIX 路径、
  1-based 行与 0-based 列，不作为自动译文身份。上下文中的文案与位置是只读的。
- `locales` 只包含已配置的目标语言。源语言不在返回译文的目标范围内。
- 返回完整远程层；未返回的槽位为 null。replace 中表示缺译，overlay 中表示使用本地译文；
  空字符串有效，新快照撤销旧覆盖。消息必须来自本次上下文，locale 必须在目标范围内，
  占位符必须与原文一致。完全相同的重复结果允许，不同值冲突时整份拒绝。
- `publicMeta` 是可选 JSON 对象；拒绝循环引用、非有限数字、函数、访问器与特殊对象。
  `TranslationMeta` 由 `@ai-i18n/vite/runtime` 的 `Register.translationMeta` 决定；
  未注册时是只读的 JSON 对象类型。
- 每次操作 30 秒超时。`signal` 用于请求取消；即使回调不响应取消，插件也不无限等待。

完整接入和失败策略见[远程文案与译文](/guide/advanced/remote-translations)。
