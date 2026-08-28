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
5. 再运行一次 Build，并按当前存储模式提交源码、Translation Memory 标记与 `overrides.json`。

运行中的 Vite Dev 会观察 Provider、Agent + MCP 和校对页写入，并更新当前已访问页面的文案；不需要
重启或手工编辑生成的 locale 文件。Dev 仍只包含浏览器访问过的模块，批量补译、孤立消息审计和提交前
验证继续以完整 Build 生成的 `extracted/` 为准。

## 自动翻译与人工译文

自动翻译默认写入 `i18n/translations/` 分片。人工确认的译文写入 `i18n/overrides.json`，并且始终优先
显示。也可以将自动译文放进用户级全局 SQLite，详见
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
`comment`、自动译文、出现文件和已有人工译文。保存后，业务页面会通过 HMR 立即使用新结果。

打开方式、筛选功能、作用范围与常见问题见[翻译校对](/guide/basic/translation-review)。

## 直接编辑译文文件

翻译校对页面适合人工确认少量译文，Provider 或 Agent + MCP 适合批量补译与自动化操作。只有在不能
启动 Vite Dev 时才建议直接编辑现有 JSON 文件，并且不要用下面的示例覆盖已经生成的内容。

默认存储下，`translations/*.json` 保存自动译文。先在分片中搜索目标 `source`，保留 `version`、消息
标识和源码信息，只修改目标消息 `translations` 下的语言值。不要修改 `manifest.json`，也不要手工把
消息移动到另一个分片。以下分片示例对应不带 `comment` 的 `t('保存')`：

```json
{
  "version": 1,
  "messages": {
    "保存": {
      "source": "保存",
      "sourceLang": "zh-CN",
      "translations": {
        "en-US": "Save"
      }
    }
  }
}
```

SQLite 模式不适合直接编辑数据库，请使用 Provider 或 Agent + MCP。少量已确认措辞仍建议写入
`overrides.json`，这样可以提交并在不同电脑间保持一致。

`overrides.json` 使用便于审查的扁平 `rules` 保存人工决定。只写 `source` 时，译文对当前 Vite
应用内的所有同源文案生效：

```json
{
  "version": 2,
  "rules": [
    {
      "source": "保存",
      "translations": {
        "en-US": "Save"
      }
    }
  ]
}
```

同一句话只需要在部分文件采用不同译法时，为规则增加 `files`。路径必须是相对 Vite `root` 的
标准化 POSIX 路径，并与列表工具返回的 `source_file` 完全一致；不接受绝对路径、路径片段或 glob。
一个规则可以列出多个文件，以复用完全相同的人工决定：

```json
{
  "version": 2,
  "rules": [
    {
      "source": "保存",
      "files": ["src/editor/actions.ts", "src/editor/toolbar.ts"],
      "translations": {
        "en-US": "Save file"
      }
    },
    {
      "source": "保存",
      "comment": "保存状态",
      "files": ["src/status/panel.ts"],
      "translations": {
        "en-US": "Keep"
      }
    }
  ]
}
```

`comment` 与 `files` 可以单独使用，也可以组合。

同一文件甚至同一行的多次调用需要不同译法时，使用 `occurrences` 保存精确位置。`file` 是相对 Vite
`root` 的标准化路径，`line` 从 1 开始，`column` 从 0 开始；`occurrences` 与 `files` 不能同时出现：

```json
{
  "source": "保存",
  "occurrences": [{ "file": "src/editor/actions.ts", "line": 12, "column": 8 }],
  "translations": { "en-US": "Save this action" }
}
```

完整优先级为：出现位置 + `comment`、出现位置默认、文件 + `comment`、文件默认、全局 + `comment`、
全局默认、自动译文、源码回退。源码移动后旧位置不会模糊匹配到其他调用。建议使用
[Agent + MCP](/guide/advanced/ai-tools) 列出现有文案和精确路径，确认措辞后再写入；不要自行构造
语境标识。生成目录 `i18n/extracted/` 和 `i18n/locales/` 不接受人工编辑。

## 提交前检查

- 切换每一种支持语言，确认关键页面没有意外回退到源码文案；
- 确认占位符、代码和品牌名没有被误译；
- 运行 `vite build`；
- 遵循[生成文件与 Git](/guide/basic/directory)的提交规则。
