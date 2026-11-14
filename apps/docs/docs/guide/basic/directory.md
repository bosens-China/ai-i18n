---
title: 生成文件与 Git
description: 了解人工输入、最终语言资源和本地提取索引
---

默认在 `ai-i18n.config.ts` 旁使用 `i18n/`：

```text
i18n/locales/
├── en-US.manual.json              # 全局人工译文，key→value
├── en-US.json                     # 生成的全局最终资源，key→value
└── files/
    ├── en-US.manual.json          # 文件范围人工译文，key→value
    ├── manifest.json              # 文件标识到资源包的映射
    └── en-US/<group>.json         # 按需加载的文件范围资源
```

`*.manual.json` 是项目人工译文的权威输入。适配器本次返回的译文只用于本次生成，不会写进人工文件；下一次 Build 未返回该译文时，最终资源会回退到人工值或缺译。生成的 `*.json` 是处理后的最终数据，可随源码提交 Git 以供审查和部署，但不要在其中直接修词。

Build 还会把最终资源复制到 `dist/locales/`。文件范围资源按异步模块边界合并，不按每个源码文件生成长路径 JSON。全局 key 不包含路径，文件范围 key 使用短文件标识；`manifest.json` 负责选择文件包。

提取索引位于仓库根的 `node_modules/.cache/ai-i18n/extracted.sqlite`，按应用分区。它可从源码重建，不提交 Git，也不共享给团队或 CI。请保留常规 `node_modules/` 忽略规则。

旧 `extracted/`、`translations/`、`overrides/` 不再用于运行。首次完整构建或扫描会尝试把可无损转换的旧人工规则迁入 `*.manual.json`，随后清理旧目录。无法确定新身份的旧规则会报错并保留原文件供人工处理。旧自动译文缓存不会自动当作人工译文。

Monorepo 中，每个 Vite 应用使用自己的 `i18n/` 和配置；共享源码由消费它的应用扫描。源码、人工输入、可选最终资源与生成的声明文件一起提交。执行新的 Build 后再解决同一 key 的 Git 合并冲突。
