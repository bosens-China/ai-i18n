---
title: 仓库提取索引
description: 了解内置 SQLite 的用途和可重建边界
---

ai-i18n 使用 Node.js 22.13+ 的 `node:sqlite` 保存当前工作树的提取索引，默认位置为仓库根的 `node_modules/.cache/ai-i18n/extracted.sqlite`。它只记录源码中活动的文案身份，不保存翻译结果。完整 Build 或显式 MCP 扫描会重建它；数据库丢失后再次扫描即可恢复。

翻译结果分为可提交的人工输入 `i18n/locales/*.manual.json` 和本轮生成的最终 `i18n/locales/*.json`。适配器结果只在本轮生效。不要编辑或提交 SQLite 文件；团队和 CI 通过源码、人工文件以及构建过程协作。
