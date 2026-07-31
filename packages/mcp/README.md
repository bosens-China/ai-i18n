# @ai-i18n/mcp

本地 stdio MCP server，为 Agent 提供 ai-i18n 翻译与人工审校的查询、设置和删除能力。

MCP 不扫描 workspace，也不执行 Vite 配置。Agent 必须先确认目标 Vite 应用，读取它的
`vite.config.*` 和启动脚本，再将 Vite `root` 与 `aiI18n({ directory })`（默认 `i18n`）
解析为最终绝对 `i18n_directory`。在 monorepo 中，每个 Vite build 分开处理，不能把仓库
根目录或第一个同名目录当成协议目录。

目标应用完整 Build 时，其可达的本地 workspace 源码也会进入该应用的 `extracted/`。
因此 `packages/ui` 等纯源码包不是另一个 MCP 目标；它的消息通过消费应用的
`i18n_directory` 查询。多个 Vite build 不能共用一个协议目录，需要分别调用 MCP。

`extracted/` 使用 source 的 SHA-256 作为物理文件名。MCP 扫描 JSON 内容并使用其中的
标准化 `source`，不会从 hash 文件名推断源码路径。

MCP 会校验绝对路径、目录是否存在，以及 `translations.json`、`overrides.json` 和
`extracted/` 是否符合当前协议。`extracted/` 是不提交 Git 的本地 Build 产物。首次使用、
目录缺失或为空，或者切换分支和修改提取相关配置后，先运行目标应用的一次完整 Vite Build。
Dev 只包含浏览器实际请求过的模块。

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

- `ai_i18n_list_translations`：默认直接列出 `translations.json` 中仍缺失的消息，也可返回
  文件汇总或全部消息。首次调用省略 `source_files` 即可发现路径。相同 `source + comment`
  无论出现在哪些文件都只返回一条，并在 `source_files` 中列出完整共享范围。
- `ai_i18n_set_translations`：默认只填充 `null`；显式传
  `overwrite_existing: true` 时允许覆盖非空译文。写入目标使用列表返回的
  `message: { source, comment? }`，调用方不接触内部 message ID。
- `ai_i18n_clear_translations`：把指定译文重置为 `null`，不删除消息或 locale。
- `ai_i18n_list_overrides`：逐 locale 列出 `overrides.json` 中的人工值，包括 orphan，并
  返回删除所需的 opaque `override_id`。
- `ai_i18n_set_overrides`：添加或覆盖人工值；`default` scope 影响同一原文的全部调用，
  `message` scope 只接受带 comment 的消息；两种 scope 都使用公开 `message` 对象定位。
- `ai_i18n_delete_overrides`：使用列表返回的 `override_id` 删除具体人工值。

列表默认请求 100 条，`limit` 可在 1 到 500 之间调整。响应仍会保护在约 100,000 个字符内，
所以记录较大时实际 `count` 可能小于 `limit`；每条记录保持完整，继续按 `next_cursor`
即可无遗漏翻页。所有工具只返回一份紧凑 JSON
`TextContent`，不重复返回 `structuredContent`。工具名、字段名、描述和错误码使用英文，
由 Agent 按用户语言解释。

普通翻译更新示例：

```json
{
  "i18n_directory": "/absolute/path/to/i18n",
  "updates": [
    {
      "message": {
        "source": "#pack",
        "comment": "设备名称"
      },
      "locale": "en-US",
      "value": "Pack"
    }
  ]
}
```

## 写入边界

- 翻译工具只修改 `translations.json`；人工审校工具只修改 `overrides.json`。
- MCP 不修改 `extracted/` 或 `locales/`。
- 每批写入都取得跨进程锁，在锁内重读并校验最新文件，然后按字段原子更新。
- 每批最多 500 个输入。相同目标与相同值重复出现时只写一次并返回
  `deduplicated_count`；同一目标出现不同值时整批以 `DUPLICATE_TARGET_CONFLICT` 失败。
- `affected_file_count` 统计目标消息在应用中实际出现的源文件数量。写入一次即可影响
  `source_files` 中的全部 occurrence。
- 模板占位符必须保持一致，空字符串是合法译文。
- Vite Dev 运行时会自动重建 locales；否则在下一次 `vite dev` 或 `vite build` 时同步。

写入时若 `message` 不再存在，请重新调用 `ai_i18n_list_translations`，并原样复制返回的
`message` 对象。`source_files` 只用于展示共享范围和精确文件过滤，不是写入身份的一部分。
