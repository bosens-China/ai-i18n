---
title: 补译与审校
description: 补齐缺失译文、人工确认用词，并在提交前验证结果
---

ai-i18n 不会用空字符串代替缺失译文。缺译时页面会回退显示源码文案，因此可以先完成开发，再逐步处理翻译。

## 推荐流程

1. 运行一次完整 `vite build`，让当前应用的可达文案进入翻译结果。
2. 选择一种补译方式：配置 [AI 翻译](/guide/advanced/ai-translation)，或使用
   [Agent + MCP](/guide/advanced/ai-tools)。
3. 检查关键页面和产品术语。
4. 对不满意或需要固定的译文进行人工审校。
5. 再运行一次 Build，并按当前存储模式提交源码、Translation Memory 标记与 `overrides.json`。

## 自动翻译与人工译文

自动翻译默认写入 `i18n/translations/` 分片。人工确认的译文写入 `i18n/overrides.json`，并且始终优先
显示。也可以将自动译文放进用户级全局 SQLite，详见
[Translation Memory](/guide/advanced/translation-memory)。

适合人工审校的情况包括：

- 品牌名、产品术语和法律文案；
- 同一原文在不同页面代表不同含义；
- 需要符合团队既有的语言风格。

同一句原文有不同含义时，请为调用添加静态 `comment`，再按该语境分别审校：

```ts
t('保存', { comment: '保存文件按钮' });
t('保存', { comment: '保存状态' });
```

## 直接编辑译文文件

Provider 或 Agent + MCP 会自动维护文件结构，适合批量补译和按语境审校。需要手工调整少量译文时，
也可以编辑现有 JSON 文件，但不要用下面的示例覆盖已经生成的内容。

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
一个规则可以列出多个文件，以复用完全相同的审校决定：

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

`comment` 与 `files` 可以单独使用，也可以组合。最终优先级从高到低是：文件 + `comment`、全局 +
`comment`、文件默认、全局默认、自动译文、源码回退。建议使用
[Agent + MCP](/guide/advanced/ai-tools) 列出现有文案和精确路径，确认措辞后再写入；不要自行构造
语境标识。生成目录 `i18n/extracted/` 和 `i18n/locales/` 不接受人工编辑。

## 提交前检查

- 切换每一种支持语言，确认关键页面没有意外回退到源码文案；
- 确认占位符、代码和品牌名没有被误译；
- 运行 `vite build`；
- 遵循[生成文件与 Git](/guide/basic/directory)的提交规则。
