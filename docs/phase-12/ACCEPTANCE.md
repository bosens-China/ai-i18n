# Phase 12 验收

状态：Passed。

## 验收项

- `t(messages)` 翻译嵌套对象和数组中的所有字符串叶子，并保持其他基础类型。
- Vue `tRef(messages)` 返回同形只读计算属性，语言切换后整棵树更新。
- React 从 `useI18n()` 获取的 `t(messages)` 随组件订阅重新执行。
- 本地和导入静态树无需 `defineI18nMessages()` 或 `as const` 即可提取。
- 成员级和动态索引调用继续要求 `defineI18nMessages()`。
- 动态树、非普通对象、循环引用和带额外参数的整树调用被拒绝。
- 用户文档与 skills 明确 message-only 边界、框架生命周期和首次 MCP 使用前的 Build 流程。
- MCP schema、协议文件格式和 message ID 算法保持不变。

## 验证结果

- `pnpm test`：44 个测试文件、373 个测试全部通过。
- `pnpm check`：构建、publint、类型入口检查、TypeScript、ESLint、三套示例与文档代码检查
  全部通过。
- `pnpm --filter @ai-i18n/docs build`：Rspress HTML、Markdown 与 LLM 索引构建通过；新增
  `MessageTree`、`TranslatedMessageTree` 页面和更新后的 Runtime 页面均成功生成。
