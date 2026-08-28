# @ai-i18n/mcp

本地 stdio MCP server，为 Agent 提供 ai-i18n 翻译与人工校对的查询、设置和删除能力。

MCP 不扫描 workspace，也不执行 Vite 配置。Agent 必须先确认目标 Vite 应用，读取它的
`vite.config.*` 和启动脚本，再将 Vite `root` 与 `aiI18n({ directory })`（默认 `i18n`）
解析为最终绝对 `i18n_directory`。在 monorepo 中，每个 Vite build 分开处理，不能把仓库
根目录或第一个同名目录当成协议目录。

目标应用完整 Build 时，其可达的本地 workspace 源码也会进入该应用的 `extracted/`。
因此 `packages/ui` 等纯源码包不是另一个 MCP 目标；它的消息通过消费应用的
`i18n_directory` 查询。多个 Vite build 不能共用一个协议目录，需要分别调用 MCP。

`extracted/` 使用 source 的 SHA-256 作为物理文件名。MCP 扫描 JSON 内容并使用其中的
标准化 `source`，不会从 hash 文件名推断源码路径。

MCP 会校验绝对路径、目录是否存在，以及项目 `translations/`、`overrides/` 和 `extracted/`
是否符合当前协议。MCP 始终读写项目 JSON，不读取个人 SQLite 候选缓存，也不读取或执行 Vite 配置。
`extracted/` 是不提交 Git 的本地 Build 产物。首次使用，或者切换分支和修改提取相关配置后，
先运行目标应用的一次完整 Vite Build。Dev 只包含浏览器实际请求过的模块。

MCP 宿主可以直接执行 npm 包：

```json
{
  "command": "npx",
  "args": ["-y", "@ai-i18n/mcp@alpha"]
}
```

如果已经在本地或全局安装，也可以把 `command` 改成包提供的 `ai-i18n-mcp`，无需参数。
server 使用 stdio 通信，标准输出专用于 MCP 协议。

## 工具

- `ai_i18n_list_translations`：默认直接列出当前 Translation Memory 中仍缺失的消息，也可返回
  文件汇总或全部消息。首次调用省略 `source_files` 以扫描整个应用。相同 `source + comment`
  无论出现在哪些文件都只返回一条。响应默认省略出现文件；需要检查完整共享范围时显式传
  `include_source_files: true`。短文案需要源码语境时，可传 `include_occurrences: true`，取得
  每个 `source_file` 对应的完整 `locations`；MCP 不读取或返回源码片段。`missing` 与 `all`
  视图还可使用大小写不敏感的 `source_contains` 和 `translation_contains` 在分页前筛选消息；
  后者只检查 `locales` 选中的非空译文。
- `ai_i18n_set_translations`：默认只填充 `null`；显式传
  `overwrite_existing: true` 时允许覆盖非空译文。写入目标使用列表返回的
  `message: { source, comment? }`，调用方不接触内部 message ID。单语言批次可在顶层提供
  `default_locale` 并省略每项的 `locale`；否则每项必须提供 `locale`。
- `ai_i18n_clear_translations`：把指定译文重置为 `null`，不删除消息或 locale；同样支持批次
  `default_locale`。
- `ai_i18n_list_orphan_messages`：只在用户明确要求审查或清理时调用。完整 Build 后，列出
  Translation Memory 中已不再被 `extracted/` 引用的消息，并返回删除所需的 opaque
  `orphan_id`。
- `ai_i18n_delete_orphan_messages`：用户审查列表并明确批准后，按 `orphan_id` 原子删除孤立
  Translation Memory。删除前会整批复验；任一消息重新被源码引用时，整批失败且不修改文件。
- `ai_i18n_list_overrides`：逐 locale 列出 `overrides/` 中的人工值，包括 orphan，并
  返回删除所需的 opaque `override_id`。文件级和位置级规则分别返回作为规则身份的 `files` 与
  `occurrences`；消息实际出现的
  `source_files` 默认省略，可用 `include_source_files: true` 显式请求。
- `ai_i18n_set_overrides`：添加或覆盖人工值。每项使用公开 `message` 对象定位；省略 `files` 和
  `occurrences` 表示全局校对，提供精确 `source_file` 表示文件级校对，提供列表返回的
  `source_file + line + column` 表示位置级校对。`files` 与 `occurrences` 互斥，也支持批次
  `default_locale`。
- `ai_i18n_delete_overrides`：使用列表返回的 `override_id` 删除具体人工值。

列表默认请求 100 条，`limit` 可在 1 到 500 之间调整。响应仍会保护在约 100,000 个字符内，
所以记录较大时实际 `count` 可能小于 `limit`；每条记录保持完整，继续按 `next_cursor`
即可无遗漏翻页。所有工具只返回一份紧凑 JSON
`TextContent`，不重复返回 `structuredContent`。工具名、字段名、描述和错误码使用英文，
由 Agent 按用户语言解释。

批量 `updates` 或 `targets` 中重复出现同一个未知字段时，参数校验只返回一条合并错误，包含
出现次数、首次位置、合法字段和下一步修改方式。业务错误返回稳定 `error_code` 的同时也会返回
可直接执行的 `next_action`；Agent 应优先按该动作恢复，再使用错误码文档兜底。

普通翻译更新示例：

```json
{
  "i18n_directory": "/absolute/path/to/i18n",
  "default_locale": "en-US",
  "updates": [
    {
      "message": {
        "source": "#pack",
        "comment": "设备名称"
      },
      "value": "Pack"
    }
  ]
}
```

## 写入边界

- 翻译工具只修改项目 `translations/` 分桶；人工校对工具只修改项目 `overrides/` 分桶。
- 可选 SQLite 只由 Vite 用作个人候选缓存；MCP 不读取或写入数据库。
- MCP 不读取 Vite 的 `provider.cache`；Provider 是否刷新进程缓存，不改变 Agent 的列表、写入或清除行为。
- MCP 不修改 `extracted/` 或 `locales/`。
- 每批写入都取得跨进程锁，在锁内重读并校验最新文件，然后按字段原子更新。
- 每批最多 500 个输入。相同目标与相同值重复出现时只写一次并返回
  `deduplicated_count`；同一目标出现不同值时整批以 `DUPLICATE_TARGET_CONFLICT` 失败。
- `affected_file_count` 统计目标消息在应用中实际出现的源文件数量。写入一次即可影响
  对应 occurrence；文件级和位置级人工校对只统计并影响显式范围。需要逐文件检查时，在列表调用中请求
  `include_source_files: true`。
- 模板占位符必须保持一致，空字符串是合法译文。不一致时整批以
  `TEMPLATE_TOKEN_MISMATCH` 失败，并返回 `expected_tokens`、`received_tokens`、
  `missing_tokens` 与 `unexpected_tokens`；重复 token 按出现次数比较。
- Vite Dev 运行时会自动重建 locales；否则在下一次 `vite dev` 或 `vite build` 时同步。

写入时若 `message` 不再存在，请重新调用 `ai_i18n_list_translations`，并原样复制返回的
`message` 对象。错误会提供最多 5 个只读候选；候选只帮助定位，不会自动替换精确消息身份。
`source_files` 过滤器只用于缩小列表范围；响应中的同名字段仅在显式请求时返回。
它们不属于普通 Translation Memory 写入身份。人工校对更新使用 `files` 或 `occurrences` 作为可选
范围；路径与行列位置必须从列表结果原样复制。

人工校对最终优先级为：位置 + `comment`、位置默认、文件 + `comment`、文件默认、全局 +
`comment`、全局默认、自动译文、源码回退。位置使用 1-based `line` 与 0-based `column`；源码移动后
旧位置规则作为 orphan 保留，不自动猜测新位置。

## 孤立消息清理

普通补译、校对或验证任务不得自动检查或删除孤立消息。只有用户明确要求审查或清理时，Agent
才执行以下流程：

1. 运行目标应用的一次完整 Vite Build。Dev 只处理已访问模块，不能作为安全清理依据。
2. 完整翻页读取 `ai_i18n_list_orphan_messages`，向用户展示数量、消息和仍保存的译文。
3. 用户明确批准具体清理范围后，原样复制 `orphan_id` 到
   `ai_i18n_delete_orphan_messages`；不得自行构造 ID。
4. 再次列出孤立消息，验证删除结果。

孤立消息工具只读写当前 Translation Memory。`overrides/` 中的孤立人工值继续通过 override
列表与删除工具独立审查，不能随 Translation Memory 联动删除。运行清理期间不要并行执行 Build
或手工修改协议文件。
