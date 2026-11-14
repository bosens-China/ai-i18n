---
title: 通用常见问题
description: 排查版本、扫描、缺译与生成资源
---

## 最低版本是什么？

需要 Vite 8+ 和 Node.js **22.13.0+**。Vite 8 在 Node 22 系列的起点是 22.12.0；ai-i18n 使用不再需要启动标志的内置 `node:sqlite`，因此提高到 22.13.0。当前只支持浏览器端应用，不提供 SSR 按请求翻译。

## 为什么 Dev 没提取完整项目？

Dev 只转换实际请求的页面代码并加载已有资源，不写 SQLite、调用翻译适配器或重建最终资源。运行 `vite build`，或让 Agent 显式扫描 Vite 入口。扫描后可用 MCP 列出活动文案和缺译。

## 写入人工译文后为何页面仍是旧值？

`*.manual.json` 是输入，`locales/*.json` 是最终资源。再次 Build 或显式扫描后才会生成新资源；刷新页面可读取新结果。不要直接编辑生成 JSON 来修词。

## 文件译文为何回退到全局？

只有 `t('文案', { scope: 'file' })` 启用文件范围。文件译文缺失时会查找同一身份的全局译文。带 comment 与不带 comment 是两个身份，彼此不回退；缺译最终显示原文。

## 多个进程能同时写入人工文件吗？

Build 和扫描会原子替换各自生成文件；人工文件应避免由多个进程同时修改同一 key。按应用分别配置目录，完成一轮写入后再扫描或构建。

## 是否支持自动导入？

设置 `autoImport: true` 即可，无需安装 `unplugin-auto-import`。局部同名 binding 优先。框架细节见[自动导入](/guide/basic/auto-import)。

## 如何诊断性能？

设置 `diagnostics.performance: true`，查看[性能诊断](/guide/advanced/performance)。性能报告不代表译文已写入；以扫描或 Build 结果为准。
