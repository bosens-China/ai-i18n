# @ai-i18n/sqlite

安装前请按[版本选择与升级](https://bosens-china.github.io/ai-i18n/guide/getting-started/versions)确认 npm 发布状态；示例选择 1.x 正式版，尚未上架时显式使用 `@alpha`。

ai-i18n 的可选个人 Translation Memory 候选缓存。项目自动译文始终写入可提交的
`i18n/translations/` 分桶 JSON；本包不替代项目存储。

```bash
pnpm add -D @ai-i18n/sqlite@^1.0.0
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

启用后，全部已有自动译文和人工覆盖按翻译目录真实路径同步。Dev/Build 在请求 Provider 前精确查询
语言对、原文与 comment；所有有效候选去重后只有一个译值且含自动来源时，先补写项目 JSON 再使用。
人工来源只能作为候选；不同译值冲突不自动选择，无 Provider 时回退原文。已有项目译文不会被覆盖。

同项目改译或清空替换自动贡献，不保留无限失效行；人工覆盖删除即撤销贡献。自动孤儿默认保留，
`sqlite({ pruneOrphans: true })` 仅清理当前项目孤儿。查询不检查来源项目是否存在。
MCP 和审查工作台可查看译值、项目和人工原范围；工作台选择先填草稿，保存仍写项目 overrides。
MCP 独立写入后解析目标应用配置并同步已启用缓存；外置翻译目录需要提供应用目录。

`listSqliteCandidates(target, { dataDirectory, offset, sourceOffset, value })` 只读查询：
每页十个不同译值，每个译值十个来源，分别返回 `hasMore`、`sourcesHasMore`；`automaticValue`
根据全部有效候选计算。`value` 可限定一个译值以继续读取来源；分页偏移为非负整数。

`listSqliteProjects({ dataDirectory, offset })` 每页列出最多五十个来源项目及记录数、孤儿数、同步时间。
`cleanSqliteCache({ dataDirectory, scope, project?, token? })` 支持 `orphans`、`project`、`all`：
省略 token 只预览，执行需回传预览 token；缓存变化后重新预览。项目路径使用列表返回的真实路径。
清理不修改项目 JSON，下次项目同步可以重建当前贡献。
不设置 SQLite 容量上限；Vite 的 translationMemory.capacity 仍只管理项目 JSON。

禁用、删除或清理缓存不会改变已提交项目译文。
`better-sqlite3` 只属于本包，不进入 Core/Vite 默认依赖。
