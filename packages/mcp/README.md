# @ai-i18n/mcp

MCP 工具用于选择 Vite 应用、显式全量扫描文案、查看缺译，以及写入人工译文。最低 Node.js 版本为 **22.13.0**。安装时目标应用也需安装兼容版本的 `@ai-i18n/vite`。

注册服务器后按以下顺序调用：

1. `ai_i18n_discover_projects({ workspace_directory })`：查找应用配置，不执行它们。
2. `ai_i18n_resolve_project({ config_file })`：解析选定配置。
3. `ai_i18n_scan_project({ config_file })`：从 Vite 入口完整扫描并重建仓库本地 SQLite 提取索引与最终资源。
4. `ai_i18n_list_translations({ config_file, locale, view: 'missing' | 'all', cursor?, limit? })`：列出活动 key、原文、可选 comment 与文件范围、当前有效值。
5. `ai_i18n_set_translations({ config_file, locale, updates: [{ key, value }], overwrite_existing? })`：写入人工译文。
6. `ai_i18n_clear_translations({ config_file, locale, keys })`：清除指定人工值。

写入只修改 `*.manual.json`，并返回 `rebuild_required: true`。随后再次扫描或 Build，刷新最终 `locales/` 资源。文件范围的 key 应从 list 结果复制；不要根据路径自行拼接。人工值覆盖适配器值；清除人工值后，下一次扫描或 Build 才会重新计算适配器结果。

工具错误返回 `error_code` 与 `next_action`。未知 key、语言、占位符不匹配或未经允许覆盖已有人工值会拒绝整个写入请求。
