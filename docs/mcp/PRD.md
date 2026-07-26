# MCP PRD：本地翻译文件工具

> 状态：Implemented

## 1. 目标

提供独立、本地、stdio 传输的 `@ai-i18n/mcp`，让 Agent 无需自行遍历协议文件即可：

1. 列出仍有缺失翻译的源码文件。
2. 分页读取文件或全项目的具体翻译内容。
3. 批量填充缺失翻译，或提交人工审校后的修订。
4. 从客户端 workspace roots 自动发现可用协议目录。

## 2. 边界

- MCP 不扫描业务源码，不执行或解析 `vite.config.*`。
- MCP 注册与启动不接收项目路径，同一 server 可以处理不同项目。
- `ai_i18n_discover` 优先扫描客户端 workspace roots；未提供时回退 MCP 进程目录，也可显式
  传入 `cwd`。
- 发现过程只识别同时含有合法 `translations.json`、`overrides.json` 与 `extracted/` 的目录。
- `i18n_directory` 必须是经 realpath 校验的绝对目录。
- MCP 读取 extracted 来校验 source 与 message 的归属；fill 写 `translations.json`，
  review 写 `overrides.json`。
- extracted 与 locales 继续由 Vite Dev/Build 维护。

## 3. 工具

### 3.1 `ai_i18n_discover`

返回所有已发现项目的绝对 `i18n_directory` 和 `workspace_root`。`cwd` 仅作为显式回退。

### 3.2 `ai_i18n_list_translation_files`

- `i18n_directory`：必填。
- `locale`：可选。
- `cursor`：可选 opaque cursor。
- `limit`：默认 50，范围 1～200。

只返回当前 Translation Memory 中仍有 `null` 的源码文件，并按 source 稳定排序。

### 3.3 `ai_i18n_list_translations`

- `i18n_directory`：必填。
- `file`：可选；省略时按 message ID 全项目去重。
- `locale`：可选。
- `missing_only`：默认 true。
- `cursor`：可选。
- `limit`：默认 100，范围 1～200。

返回 source、comment、translations、缺失语言、代表文件和出现次数。单次结构化响应限制约
25,000 字符，超限时缩短当前页并返回 cursor。

### 3.4 `ai_i18n_write_translations`

输入一个 source 文件和最多 100 个 `message_id + locale + value`：

- `mode` 默认为 `fill`；人工确认修订时显式传入 `review`。
- `review_scope` 默认为 `default`；`message` 只接受显式 message ID。
- message 必须属于指定 source，locale 必须已存在。
- `''` 是合法翻译。
- 已有相同值视为幂等成功。
- `fill` 模式遇到不同非空值时整批失败。
- `review` 模式写独立人工覆盖，不替换 AI Memory。
- 翻译必须保留源码中的模板占位符。
- 整批验证和写入在同一个 Translation Memory 事务中完成。

## 4. 一致性

`translations.json` 保存 AI Memory，`overrides.json` 保存人工决定。MCP 写事务统一调用
Core 的共享实现：

1. 锁定系统临时目录中的稳定 sidecar 文件；原子替换数据文件不会改变锁身份。
2. 取得锁后重新读取对应目标文件，不能使用锁外旧快照覆盖。
3. `fill` 只填充 AI Memory 的 `null`；`review` 写人工 default 或显式 ID 覆盖。
4. translations 内容实际变化时递增 `revision`。
5. 使用 `atomically` 写临时文件并原子替换，最后释放锁。

Vite 使用同一事务入口，因此 Vite Provider 与 MCP 并发提交不同字段时不会整文件互相覆盖。
同一 AI 字段默认采用先提交的非空值。有效值按 `byId > default > AI Memory` 读取。

## 5. 非目标

- 读取动态 Vite 配置。
- 调用翻译 Provider。
- 自动覆盖或删除已有非空翻译。
- 兼容未发布的旧持久化协议。
- 直接编辑 extracted 或 locales。
- Streamable HTTP、远程服务、鉴权和多租户。
