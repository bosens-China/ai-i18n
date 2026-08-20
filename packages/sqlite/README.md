# @ai-i18n/sqlite

ai-i18n 的可选 SQLite Translation Memory 适配器。默认 JSON 存储不需要安装本包。

```bash
pnpm add -D @ai-i18n/sqlite@alpha
```

```ts
import { aiI18n } from '@ai-i18n/vite';
import { sqlite } from '@ai-i18n/sqlite';

aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: {
    storage: sqlite(),
  },
});
```

数据库默认位于系统用户数据目录。可通过 `AI_I18N_DATA_DIR`，或
`sqlite({ dataDirectory: '/absolute/path' })` 指定目录。Vite 会在项目 i18n 目录写入
`storage.json` marker；MCP 读取该 marker 后，会从消费项目解析本包。

`better-sqlite3` 是本包的依赖，不属于 `@ai-i18n/core` 或 `@ai-i18n/vite` 的默认依赖。
