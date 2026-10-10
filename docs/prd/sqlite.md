# SQLite 翻译记忆

- 项目 `translations/` 和 `overrides/` 是唯一事实；个人 SQLite 仅是候选缓存，不进入 Core 默认依赖。
- 通过 `translationMemory.cache: sqlite()` 显式启用后，自动同步全部已存自动译文和人工覆盖。
- 单库默认跨项目共享；项目身份是翻译目录真实路径，clone、worktree、移动目录视为不同来源。
  需要隔离时使用不同 dataDirectory，不自动探测或删除不存在的项目。
- 保存语言对、source、comment、译文、项目、自动/人工类型和人工原范围；按译值合并候选并分页返回来源。
- Dev/Build 在请求 Provider 前补齐缓存。精确身份下所有有效候选只有一个译值且含自动来源才复用；
  人工仅候选、多译值冲突不自动选优。没有 Provider 时保持缺失并回退原文。
- 已有项目译文和人工覆盖不被缓存覆盖；采用结果先提交项目 JSON，再同步 SQLite。
- 人工覆盖同步只提供候选，文件和出现位置范围不跨项目自动继承；人工冲突阻止唯一自动命中。
- 自动改译或清空撤销本项目旧贡献，不保留无限失效行；其他项目贡献不受影响。
- 自动孤儿默认保留；pruneOrphans 仅清理当前项目孤儿。人工覆盖修改、删除直接替换、撤销对应贡献。
- Dev/Build/Review 按正常生命周期同步。MCP 独立写入后解析目标应用配置同步已启用缓存，
  不启动 Dev、不提取、不请求 Provider；找不到配置时由下次 Dev/Build 校准。外置翻译目录需 app_directory。
- 同项目同步使用相同 .cache-sync 锁并重读项目文件；缓存写入事务化，故障只警告不回滚项目事实。
- MCP 候选与项目列表只读；候选包含 current_automatic_value、来源、分页与全局唯一自动值，不能从局部分页推断唯一性。
- 缓存管理支持项目列表、项目孤儿、整个项目和全库清理；执行需回传预览 token，数据库变化须重新预览。
  操作只删除缓存，不修改项目 JSON；下次同步可以重新贡献当前项目译文。
- 审查工作台按选中文案/语言按需加载候选；不预选，采用仅填入草稿，显式保存按当前范围写 overrides。
  使用既有占位符校验；切换消息取消旧请求，缓存失败可重试且不影响正常校对。
- 不引入 ORM、模糊搜索、时间/票数排名、TTL、LRU 或 SQLite 容量上限；项目 JSON capacity 与缓存清理分开。
- 尚未发布，直接采用当前候选契约和数据库结构，不维护旧接口或历史库迁移。
- 权威入口：[用户文档](../../apps/docs/docs/ai/translation-memory.md)、[SQLite README](../../packages/sqlite/README.md)、
  [MCP 契约](../../packages/mcp/README.md)。
