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

可以直接编辑两份 JSON 文件。请保持已有结构，只修改目标语言对应的译文值：

```json
{
  "messages": {
    "保存": {
      "default": {
        "en-US": "Save"
      }
    }
  }
}
```

把人工决定写入 `overrides.json`，不要覆盖 `translations.json` 中的自动翻译。生成目录
`i18n/extracted/` 和 `i18n/locales/` 不接受人工编辑。

## 提交前检查

- 切换每一种支持语言，确认关键页面没有意外回退到源码文案；
- 确认占位符、代码和品牌名没有被误译；
- 运行 `vite build`；
- 遵循[生成文件与 Git](/guide/basic/directory)的提交规则。
