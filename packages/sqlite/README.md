# @ai-i18n/sqlite

ai-i18n 的可选个人 Translation Memory 候选缓存。项目自动译文始终写入可提交的
`i18n/translations/` 分桶 JSON；本包不替代项目存储。

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
    cache: sqlite(),
  },
});
```

数据库默认位于系统用户数据目录。可通过 `AI_I18N_DATA_DIR` 或
`sqlite({ dataDirectory: '/absolute/path' })` 指定目录。

项目缺少译文时，只有精确身份下存在唯一不同候选才会复用。候选会先补写项目 JSON；没有候选或存在
多个候选时继续交给 Provider。Provider 结果也会在项目 JSON 成功落盘后同步到缓存。

启用缓存后，项目译文持续同步到 SQLite。同一项目改译或清空时旧值退出候选；其他项目仍保存旧值时
它仍可被复用。查询不会检查来源项目是否存在。已从当前项目 JSON 消失的文案默认留作历史候选；
`sqlite({ pruneOrphans: true })` 可在同步时删除当前项目的孤儿记录，默认 `false`。
旧版数据库中无法追溯来源的记录会保留，但在项目重新同步前不会提供候选。

删除或禁用数据库只会降低跨项目复用率，不会改变已经提交的项目译文或 CI 构建。MCP 的可选
SQLite 建议查询会随之返回空候选，普通 MCP 翻译工具不受影响。
`better-sqlite3` 是本包的依赖，不属于 `@ai-i18n/core` 或 `@ai-i18n/vite` 的默认依赖。
