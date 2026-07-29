# MCP PRD：本地翻译与人工审校工具

> 状态：Implemented

## 1. 目标

提供独立、本地、stdio 传输的 `@ai-i18n/mcp`，让 Agent 通过职责单一的工具完成：

1. 查询提取文件、翻译进度与具体消息。
2. 填充、覆盖或清空 `translations.json` 中的 AI Translation Memory。
3. 查询、添加、覆盖或删除 `overrides.json` 中的人工审校值。
4. 校验 Agent 提供的最终协议目录，不扫描 workspace 猜测项目。

## 2. 边界

- MCP 不扫描 workspace 或业务源码，不执行或解析 `vite.config.*`。
- MCP 注册与启动不接收项目路径，同一 server 可以处理不同项目。
- Agent 必须先确认目标 Vite build，并根据其运行目录、Vite `root` 与
  `aiI18n({ directory })`（默认 `i18n`）提供最终绝对 `i18n_directory`。
- monorepo 中每个 Vite build 独立解析；目标不明确时由 Agent 向用户确认。
- `i18n_directory` 必须是经 realpath 校验的绝对目录，并同时包含合法
  `translations.json`、`overrides.json` 与 `extracted/`。
- Git 只提交 `translations.json` 与 `overrides.json`；`extracted/` 和 `locales/` 是本地
  Build 产物。首次使用、extracted 缺失或为空，或者切换分支和修改提取相关配置后，Agent
  必须先运行目标 Vite build 的一次完整 Build。列表未返回 source file 时，Build 后重试
  一次。
- MCP 只读取单层 `extracted/*.json` 校验 source file 与 message 的归属；嵌套目录不属于
  当前协议。
- 翻译工具只修改 `translations.json`，人工审校工具只修改 `overrides.json`。
  extracted 与 locales 继续由 Vite Dev/Build 维护。

## 3. 工具

### 3.1 `ai_i18n_list_translations`

参数：

- `i18n_directory`：必填。
- `source_files`：可选 exact source path 数组；首次调用省略即可发现全部文件。
- `view`：`missing | summary | all`，默认 `missing`。
- `locales`：可选 locale 数组。
- `cursor`：可选 opaque cursor。
- `limit`：默认 50，范围 1～200。

`missing` 直接返回可用于写入的 `source_file`、`message_id`、source、comment、原始
translations 与 `missing_locales`；`summary` 返回每个提取文件的消息和缺失计数；`all`
返回全部消息。缺失状态只检查 `translations.json` 的原始值，人工覆盖不会隐藏 AI Memory
仍为 `null` 的事实。

全局统计包含文件总数、已完成/待补文件数、提取消息数、去重消息数、缺失消息数与缺失译文
字段数。结果约束在 25,000 字符内，超限时缩短当前页并返回 `next_cursor`。

### 3.2 `ai_i18n_set_translations`

一次接收最多 100 个 `source_file + message_id + locale + value`，可跨文件批量更新：

- 默认 `overwrite_existing: false`，只填充仍为 `null` 的字段。
- 现有值相同计为 unchanged；遇到不同非空值时整批失败。
- 显式设置 `overwrite_existing: true` 才允许覆盖不同非空值。
- `''` 是合法译文；模板占位符必须与 source 一致。
- 返回 added、overwritten、unchanged 与 affected file 计数。

### 3.3 `ai_i18n_clear_translations`

一次接收最多 100 个 `source_file + message_id + locale`，把对应
`translations.json` 字段重置为 `null`。工具不删除 message、locale、extracted 或
override，返回 cleared、unchanged 与 affected file 计数。

### 3.4 `ai_i18n_list_overrides`

参数：

- `i18n_directory`：必填。
- `source_files`、`locales`：可选过滤；省略 `source_files` 才能看到全部 orphan。
- `cursor`：可选。
- `limit`：默认 50，范围 1～200。

每项代表一个具体 locale 人工值，包含 opaque `override_id`、scope、source、可选
message/comment、locale、value、关联 source files 与 `orphaned`。删除时必须原样复制
`override_id`。

### 3.5 `ai_i18n_set_overrides`

一次接收最多 100 个 `source_file + message_id + locale + value + scope`：

- 始终执行 upsert，已有目标允许覆盖。
- `scope: "default"` 影响同一 source 的全部调用。
- `scope: "message"` 只接受带非空静态 comment 的 message ID。
- source 从 extracted 消息推导，调用方不重复传入。
- 返回 added、overwritten、unchanged 与 affected file 计数。

### 3.6 `ai_i18n_delete_overrides`

一次接收最多 100 个由列表工具返回的 `override_ids`，删除具体 locale 字段，并清理空的
default、byId 与 source 容器。已不存在的目标计为 unchanged。

## 4. Agent 输出契约

- 每次调用只返回一个 `TextContent`，其 `text` 是无缩进的完整 JSON。
- 不声明 `outputSchema`，不重复返回 `structuredContent`，避免同一结果占用两份 Agent
  上下文。
- 工具名、标题、描述、参数、返回字段和稳定错误码统一使用英文；协议本身不做多语言文案层，
  由 Agent 按当前用户语言解释。
- 成功结果使用稳定字段；失败结果使用 `{ "error_code": "..." }` 和必要的机器可读明细。
- `MESSAGE_NOT_FOUND` 只说明该 ID 不在指定 source file，并指向
  `ai_i18n_list_translations`；Agent 必须重新列表并原样复制 ID，不推断原因。

## 5. 一致性

所有写工具统一调用 Core 的共享事务实现：

1. 锁定系统临时目录中的稳定 sidecar 文件。
2. 取得锁后重新读取并校验最新目标 JSON。
3. 基于锁内最新值校验完整批次；重复目标或任一非法目标使整批失败。
4. 只更新目标字段；translations 内容实际变化时递增 `revision`。
5. 使用 `atomically` 写临时文件并原子替换，最后释放锁。

Vite 使用同一事务入口，因此 Vite Provider 与 MCP 并发提交不同字段时不会整文件互相覆盖。
运行时最终值仍按 `byId > default > translations.json > null/source fallback` 解析，但翻译
列表刻意展示原始 Translation Memory 状态。

## 6. 非目标

- 读取或执行动态 Vite 配置。
- 调用翻译 Provider 或模型。
- 自动选择要覆盖的非空翻译。
- 兼容旧 MCP 工具名、`mode` 或 `review_scope` 参数。
- 直接编辑 extracted 或 locales。
- Streamable HTTP、远程服务、鉴权和多租户。
