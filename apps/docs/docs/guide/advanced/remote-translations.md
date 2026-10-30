---
title: 远程文案与译文
description: 自定义文案提交、全局语言包转换和浏览器译文元数据
---

`remote` 是可选能力，直接使用现有 `@ai-i18n/vite` 包。省略它时，本地翻译流程不变。

可运行的后端、类型注册与静态快照验证见 [Hono 远程译文示例](/demo/remote)。

| 配置                     | 文案提交        | 自动译文来源                 |
| ------------------------ | --------------- | ---------------------------- |
| 不配置 remote            | 原流程          | 本地 translations / Provider |
| 只配置 publish           | 额外提交服务器  | 原流程                       |
| 只配置 load              | 不提交          | 服务器快照                   |
| 同时配置 publish 与 load | 提交服务器      | 服务器快照                   |
| load 配合 mode: overlay  | 由 publish 决定 | 服务器部分覆盖，其余使用本地 |

`publish` 可以与 Provider 共存。`load` 与 Provider 互斥。
默认 `mode: 'replace'` 继续优先应用本地人工 `overrides/`，不读取、覆盖或清理本地自动译文，
也不使用个人 SQLite 缓存。需要服务器部分覆盖、本地补齐时，显式选择 `mode: 'overlay'`。

## 服务器部分覆盖，本地补齐

```ts
const remote = defineRemote({
  mode: 'overlay',
  async load() {
    return {
      translations: [
        {
          message: { source: '保存成功' },
          locale: 'en-US',
          value: 'Changes saved',
        },
      ],
      publicMeta: { version: 'priority-42' },
    };
  },
});
```

优先级为 **远程有效译文 > 本地人工 overrides > 本地自动译文 > 原文**。
例如本地有 A/B/C，服务器只返回 B，最终使用本地 A、服务器 B、本地 C。
覆盖按 source + comment 和目标语言分别生效。

- 省略或返回 `null` 表示不提供远程覆盖；空字符串仍是有效译文。
- 每次成功获取替换整个远程覆盖层。下一次不再返回 B 时，恢复当前本地 B。
- 本地 Translation Memory 和 SQLite 仍按原流程使用，远程值不会写入其中或改写人工 overrides。
- `failOnMissingTranslations` 检查合并后的结果；远程没有返回、本地已经存在的译文不算缺译。
- 获取失败或无效快照仍使 Build 失败；Dev 保留此前成功应用的远程层。本地数据不会将失败
  请求伪装成成功的空快照。
- `publicMeta` 标识实际应用的远程层版本，不表示所有本地译文也属于该版本。

可运行 `pnpm --filter @ai-i18n/example-remote dev:overlay` 体验
[Hono 部分覆盖与撤销示例](/demo/remote)。

## 将接口接入插件

以下示例使用稳定 key，服务器只接收 key 列表，下载则返回全局 `en.json`：

```json
{
  "version": "release-42",
  "messages": { "<文案对应的key>": "Save" }
}
```

这种只提交 key 的接口需要服务器已经知道对应原文。首次登记文案的平台，可以自行发送
`{ key, source }`。插件不限制接口地址、鉴权方式或请求结构。

```ts
// i18n/remote.ts：只由 Vite 配置导入
import { createHash } from 'node:crypto';
import { defineRemote, type RemoteMessage } from '@ai-i18n/vite/remote';

function keyOf(message: RemoteMessage) {
  return createHash('sha256')
    .update(JSON.stringify([message.source, message.comment ?? null]))
    .digest('hex');
}

export const remote = defineRemote({
  async publish({ messages, signal }) {
    const response = await fetch('https://example.com/i18n/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: messages.map(keyOf) }),
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },

  async load({ messages, signal }) {
    const response = await fetch('https://example.com/i18n/en.json', {
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      !('messages' in data) ||
      !data.messages ||
      typeof data.messages !== 'object' ||
      !('version' in data) ||
      typeof data.version !== 'string'
    ) {
      throw new Error('Invalid translation response');
    }
    const values = data.messages;
    return {
      translations: messages.flatMap((message) => {
        const key = keyOf(message);
        const value = Object.hasOwn(values, key)
          ? (values as Record<string, unknown>)[key]
          : undefined;
        if (value === undefined) return [];
        if (typeof value !== 'string')
          throw new Error('Invalid translation value');
        return [{ message, locale: 'en-US', value }];
      }),
      publicMeta: { version: data.version },
    };
  },
});
```

在现有配置中注册：

```ts
import { aiI18n } from '@ai-i18n/vite';
import { remote } from './i18n/remote';

aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
  remote,
  failOnMissingTranslations: true,
});
```

也可以直接把同一个对象写在 `vite.config.ts` 的 `remote` 中；`defineRemote()` 只提供类型提示，
不要求独立文件。较复杂的请求、鉴权和映射适合放进独立模块，再由配置传入参数。
创建适配器时不要立即发送请求，请在回调中执行。

上传和下载必须使用一致的 key 映射。不同 comment 用于区分不同语义，不发送 comment 也应保留
这种身份区分。服务器全局字典可以包含其他应用的 key；适配器只转换当前 `messages` 对应的值。

## 开发与构建

- Dev 合并文案变化后后台提交和获取，源码转换不等待网络。新快照成功后更新页面；请求期间
  源码已变化的旧响应会被丢弃。默认不轮询；服务端独立完成翻译后，重启 Dev 可重新获取。
- Build 收齐本轮模块图后先提交、再获取一次完整快照，静态模块、动态模块和语言分包共用同一份数据。
- 提交完成仅表示服务器已接收，不等待异步翻译任务。提交失败报告 warning；获取失败使 Build 失败，
  不自动回退本地历史值。Dev 获取失败报告错误，保留已经成功应用的快照。
- 每次提交和获取分别最多等待 30 秒，超时或关闭时中止 `signal`；将它传给实际网络请求。
- replace 快照中没有返回的目标译文按缺译处理；overlay 则恢复本地译文。旧远程值不会被隐式保留；空字符串是有效译文。
  `failOnMissingTranslations` 继续决定缺译是否阻止构建。
- 服务端译文变化不会修改已生成的 dist。重新构建和部署后才应用新译文。

需要可复现发布时，由适配器请求固定版本的接口，而不是随时变化的 latest。
插件不替服务器保证多个独立语言接口的发布原子性。

## 在业务页面读取版本

`publicMeta` 只接受显式选择的 JSON 对象，可以包含版本等公开信息，不能包含认证凭据。
它会随成功应用的译文一起更新；插件不比较版本大小，也不自动在线升级。

```ts
import { getTranslationMeta } from 'virtual:ai-i18n';

const meta = getTranslationMeta();
console.log(meta?.version);
```

读取返回只读快照。未配置元数据、Dev 尚未加载、SSR 降级或 Vitest 专用 Runtime 中返回
`undefined`；这个读取函数不自动创建框架响应式依赖，也不加入自动导入集合。

使用 TypeScript 时，可在业务维护的声明文件注册类型，不编辑生成的 `ai-i18n.d.ts`：

```ts
// i18n/types.d.ts
import '@ai-i18n/vite/runtime';

declare module '@ai-i18n/vite/runtime' {
  interface Register {
    translationMeta: { version: string };
  }
}
```

确保配置文件和浏览器应用的 tsconfig 都包含此声明。适配器的 `publicMeta` 与
`getTranslationMeta()` 使用同一类型；未注册时保留通用 JSON 对象类型，不退化为 `any`。
同一 TypeScript 工程共享一份注册，多应用使用不同结构时应分别包含各自声明。
类型注册不会校验网络 JSON，适配器仍需检查接口响应。

## 与本地工具配合

远程快照不会写入 `translations/`。MCP 的自动译文列表与写入仍面向本地项目文件，不能据此判断
远程覆盖率，也不能通过本地补译修改服务器数据。用实际远程 Build 验证覆盖率；需要本地人工
措辞时，仍可使用校对或 MCP 写入 `overrides/`。overlay 中有效远程值仍优先于本地校对；
本地补译可以补齐其余文案，最终效果需用实际 Build 验证。

独立入口扫描不执行远程提交或获取，只更新源码清单，不能替代远程覆盖率检查。
Codex 插件结束检查不会根据远程模式的扫描结果要求本地自动补译。
认证代码仅在 Node 侧执行，浏览器
只接收最终译文和 `publicMeta`。回调上下文和返回值的完整定义见
[`RemoteAdapter`](/api/vite/interfaces/remote-adapter)。
