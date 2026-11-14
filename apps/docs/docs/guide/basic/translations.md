---
title: 补齐和确认译文
description: 通过 MCP 或人工文件补译，并刷新最终语言资源
---

缺译时页面显示源码文案。Dev 不会自动翻译；运行完整 Build 或显式 MCP 扫描才会提取全部入口可达文案、调用适配器并更新最终资源。

## 文案身份

```ts
t('保存'); // 全局 key：保存
t('保存', { comment: '按钮' }); // 独立全局 key：保存#按钮
t('保存', { scope: 'file' }); // 当前文件，缺译回退到全局“保存”
t('保存', { scope: 'file', comment: '按钮' }); // 当前文件，缺译回退到“保存#按钮”
```

`comment` 只改变翻译身份，不改变范围。带 comment 的文案缺译后直接显示原文，不借用不带 comment 的译文。`scope: 'file'` 才启用文件范围；文件译文缺失时查找相同 comment 的全局译文。

人工译文始终优先于适配器结果，空字符串也是有效译文。人工译文存放在 `i18n/locales/<locale>.manual.json` 和文件范围的 `i18n/locales/files/<locale>.manual.json`。全局 key 可以直接按原文或 `原文#comment` 写；文件 key 请从 Agent 的文案列表复制，不要手工猜文件标识。占位符必须与原文一致。

## 推荐流程

1. 运行 `vite build` 或让 Agent 显式扫描，取得完整文案目录。
2. 使用 [Agent + MCP](/ai/ai-tools) 列出缺译并写入人工译文，或编辑已有 `*.manual.json`。
3. 再运行扫描或 Build，使生成的 `locales/` 和 `dist/locales/` 反映人工值。
4. 切换语言检查页面和占位符，再按[生成文件与 Git](/guide/basic/directory)提交。

少量人工校对也可启用 [Review 工作台](/guide/basic/translation-review)。保存后需重新扫描或构建，页面才会使用更新后的最终资源。

需要在发布前保证译文齐全时，设置 `failOnMissingTranslations: true`；缺译会使 Build 失败。默认关闭。
