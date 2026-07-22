# MCP PRD：本地翻译文件工具

> 状态：Implemented

## 1. 目标

提供一个独立、本地、stdio 传输的 `@ai-i18n/mcp`，让 Agent 无需自行遍历 i18n 协议文件即可：

1. 列出仍有缺失翻译的源码文件。
2. 分页读取文件或全项目的具体翻译内容。
3. 批量填充 extracted 文件中的缺失翻译。

## 2. 边界

- MCP 不扫描业务源码，不执行或解析 `vite.config.*`。
- Agent 负责读取 Vite 配置，并传入相对于 MCP workspace root 的最终 `i18n_directory`。
- MCP workspace root 默认为进程 cwd，可通过 `--root` 固定。
- `i18n_directory` 必须是相对路径，解析结果和 realpath 都不得逃逸 workspace root。
- MCP 只修改 `extracted/**`；cache、重复 extracted 和 locales 继续由 Vite Dev/Build 校准。
- 不提供 manifest、临时注册表、node_modules 缓存或自动项目发现。

## 3. 工具

### 3.1 `ai_i18n_list_translation_files`

输入：

- `i18n_directory`：必填，最终协议目录相对 workspace root 的路径。
- `locale`：可选，只统计指定目标语言。
- `cursor`：可选，上一页返回的 opaque cursor。
- `limit`：默认 50，范围 1～200。

只返回有效 Translation Memory 合并后仍存在 `null` 的源码文件，并按 source 稳定排序。

### 3.2 `ai_i18n_list_translations`

输入：

- `i18n_directory`：必填。
- `file`：可选，使用第一个工具返回的 source；省略时按 message ID 全项目去重。
- `locale`：可选，只返回指定目标语言。
- `missing_only`：默认 true。
- `cursor`：可选。
- `limit`：默认 100，范围 1～200。

返回 source、comment、有效 translations、缺失语言、代表文件和出现次数。单次结构化响应限制约
25,000 字符，超限时缩短当前页并返回下一页 cursor。

### 3.3 `ai_i18n_write_translations`

输入一个 source 文件和最多 100 个 `message_id + locale + value`：

- 只允许填充当前有效值为 `null` 的项。
- `''` 是合法翻译。
- 已有相同值视为幂等成功。
- 已有不同非空值时整批失败，不允许 last-write-wins。
- message 必须属于指定 source，locale 必须已存在。
- 整批校验后通过临时文件 + rename 原子写入。
- 单个 MCP 进程内串行执行写任务。

## 4. 一致性

查询时先读取并校验 `cache.json` 与所有 `extracted/**/*.json`，再复用 Core 冲突合并规则计算
有效 Translation Memory。这样 extracted 中的旧 `null` 不会覆盖 cache 已有值，也不会重复翻译。

写入前重新读取最新磁盘状态。Vite Dev 运行时会通过现有 watcher 自动同步；否则下一次 Dev
或 Build 校准 cache、其他活动 extracted 和 locales。

## 5. 非目标

- 自动选择 Vite 项目或翻译目录。
- 读取动态 Vite 配置。
- 调用翻译 Provider。
- 覆盖或删除已有翻译。
- 直接编辑 locales 或 cache。
- Streamable HTTP、远程服务、鉴权和多租户。
