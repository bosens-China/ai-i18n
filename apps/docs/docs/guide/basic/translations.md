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
5. 再运行一次 Build，并提交源码、`translations.json` 与 `overrides.json`。

## 自动翻译与人工译文

自动翻译写入 `i18n/translations.json`。人工确认的译文写入 `i18n/overrides.json`，并且始终优先显示。

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

`translations.json` 保存自动译文。保留文件中的 `version`、`revision`、消息标识和源码信息，只修改
目标消息 `translations` 下的语言值。以下完整示例对应不带 `comment` 的 `t('保存')`：

```json
{
  "version": 1,
  "revision": 0,
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

`overrides.json` 保存人工决定。没有语境区分的文案可以写入对应消息的 `default`：

```json
{
  "version": 1,
  "messages": {
    "保存": {
      "default": {
        "en-US": "Save"
      }
    }
  }
}
```

需要根据静态 `comment` 区分语境时，使用 [Agent + MCP](/guide/advanced/ai-tools) 列出现有文案，
确认建议措辞后再写入人工审校结果。不要自行构造语境标识。生成目录 `i18n/extracted/` 和
`i18n/locales/` 不接受人工编辑。

## 提交前检查

- 切换每一种支持语言，确认关键页面没有意外回退到源码文案；
- 确认占位符、代码和品牌名没有被误译；
- 运行 `vite build`；
- 遵循[生成文件与 Git](/guide/basic/directory)的提交规则。
