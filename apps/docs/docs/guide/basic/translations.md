---
title: 补齐和确认译文
description: 补齐缺失译文、人工确认用词，并在提交前验证结果
---

ai-i18n 不会用空字符串代替缺失译文。缺译时页面会回退显示源码文案，因此可以先完成开发，再逐步处理翻译。

## 推荐流程

1. 运行 `vite dev` 并打开需要校对的业务页面，让相关模块进入当前 Dev 模块图。
2. 选择一种补译方式：配置 [AI 翻译](/guide/advanced/ai-translation)，或使用
   [Agent + MCP](/guide/advanced/ai-tools)。
3. 如已注册 `aiI18nReview()`，点击业务页面右下角图标检查当前页，或打开 Dev 控制台打印的独立地址检查全部文案。
4. 对不满意或需要固定的译文保存人工校对结果。
5. 再运行一次 Build，并提交源码、`translations/` 与 `overrides/`。

运行中的 Vite Dev 会更新当前已访问页面的文案；不需要重启或手工编辑生成的语言包。Dev 仍只包含
浏览器访问过的模块，批量补译和提交前验证继续以完整 Build 为准。

## 自动翻译与人工译文

自动翻译写入 `i18n/translations/` 分桶。人工确认的译文写入 `i18n/overrides/` 分桶，并且
始终优先显示。SQLite 只可作为个人候选缓存，命中结果仍会补写项目 JSON，详见
[Translation Memory](/guide/advanced/translation-memory)。

适合人工校对的情况包括：

- 品牌名、产品术语和法律文案；
- 同一原文在不同页面代表不同含义；
- 需要符合团队既有的语言风格。

同一句原文有不同含义时，请为调用添加静态 `comment`，再按该语境分别校对：

```ts
t('保存', { comment: '保存文件按钮' });
t('保存', { comment: '保存状态' });
```

## 使用翻译校对页面

在 Vite 配置中注册 `aiI18nReview()` 后，Vite Dev 会提供翻译校对工作台。它会显示原文、静态
`comment`、自动译文、出现文件和已有人工译文。保存后，业务页面会立即使用新结果。

打开方式、筛选功能、作用范围与常见问题见[翻译校对](/guide/basic/translation-review)。

## 处理译文文件

优先使用翻译校对页面处理少量人工译文，使用 Provider 或 Agent + MCP 批量补译。无法启动 Vite Dev 时，
可以修改已有译文的文本；不要新增、删除、移动条目，也不要手动改变译文的生效范围。

不要直接编辑 SQLite 数据库或 `i18n/extracted/`、`i18n/locales/`。前者只是个人候选缓存，后两者都是
构建产物。项目译文的存储方式、缓存边界与 Git 协作规则见
[Translation Memory](/guide/advanced/translation-memory) 和[生成文件与 Git](/guide/basic/directory)。

## 提交前检查

- 切换每一种支持语言，确认关键页面没有意外回退到源码文案；
- 确认占位符、代码和品牌名没有被误译；
- 运行 `vite build`；
- 遵循[生成文件与 Git](/guide/basic/directory)的提交规则。
