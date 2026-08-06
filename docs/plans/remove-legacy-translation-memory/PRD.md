# 稳定版移除单文件 Translation Memory 兼容

- 基线：[现行产品决策](../../PRD.md)
- 依赖：无
- 完成时点：首个非 prerelease 稳定版本发布前

## 背景与目标

Alpha 阶段允许旧项目把 `i18n/translations.json` 自动迁移为分片 JSON。该逻辑只服务于预发布版本之间的过渡，不进入正式稳定版。

## 新增、变更与移除

- 删除 `translations.json` 的读取、存储推断、自动迁移和清理逻辑。
- 删除仅服务于旧单文件协议的路径常量、测试辅助代码和迁移测试。
- 删除用户文档、包 README 与 Agent Skill 中关于自动迁移的说明。
- 正式稳定版不读取或删除遗留的 `translations.json`。升级说明应要求用户先运行最后一个支持迁移的预发布版本，完成并提交分片文件。

## 范围与非目标

- 保留默认分片 JSON、`storage.json`、全局 SQLite 及两种驱动之间的迁移能力。
- 不为其他未发布 schema 或 MCP 参数增加兼容分支。
- 本计划不改变 Alpha 阶段的现行自动迁移行为。

## 验收标准

- Core、Vite 与 MCP 不再引用旧单文件 Translation Memory 路径。
- 仓库中不存在 `TODO(stable-release)`。
- 用户文档、包 README、相关 Agent Skill 与测试只描述分片 JSON 和 SQLite。
- 完整类型检查、Lint、测试、文档构建和示例构建通过。

## 对后续计划的影响

完成后，把“不保留旧单文件兼容层”合并到现行 PRD，并删除本计划目录及其索引项。
