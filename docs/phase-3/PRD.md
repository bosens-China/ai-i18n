# Phase 3 PRD：持久化协议与 React 响应式修复

> 状态：Implemented，已完成外部验收

## 1. 背景

真实 React 19 + React Compiler 项目暴露了五项问题：

1. `locales/` 为 source locale 生成了重复文件。
2. `defaultLang` 与 `sourceLang` 相同时，示例仍重复配置。
3. `extracted/` 复制源码目录层级，不方便集中管理。
4. `cache.json` 保存了可由 extracted 与 ProjectState 推导的 file records。
5. React Hook 返回稳定的 `t` 引用，React Compiler 可能缓存部分翻译结果。

## 2. 产品结论

- `locales` 仍是 Runtime 的可选语言列表。`sourceLang` 与非 source 的 `defaultLang`
  必须存在于该列表。
- `defaultLang` 省略时等于 `sourceLang`。两者相同时，文档示例省略 `defaultLang`。
- `locales/` 只生成目标语言文件。source fallback 直接来自源码与 Runtime registration。
- `extracted/` 使用单层、可读且无碰撞的文件名。例如
  `src/components/App.tsx` 对应 `src_components_App.tsx.json`。
- `cache.json` 使用 v2 schema，只保留 `version` 与 `messages`。每条消息记录
  `sourceLang`、可选 `comment` 和 `translations`。
- 查找 Translation Memory 时先按当前 message ID 命中。未命中时，允许用当前 source
  文案反查历史 `translations[sourceLang]`。候选唯一且 comment 一致时复用历史翻译。
- v1 cache 在 Vite 读入时迁移为 v2。旧的嵌套 extracted 文件在对应模块再次同步后迁移为
  扁平文件。
- React adapter 在 Runtime revision 变化时更新 `t` 的函数引用，使 React Compiler
  重新计算依赖翻译函数的缓存结果。

## 3. 数据安全

- source locale 不进入 `translations`；历史 source language 在反向复用后作为目标翻译保留。
- 反向查找存在多个候选时不猜测，保留缺失翻译。
- cache 容量与 orphan 清理仍只删除非活跃消息。活动集合由现有 extracted 与当前
  ProjectState 计算。
- extracted 文件名编码必须区分路径分隔符与源码文件名中的下划线。

## 4. 验收标准

- source locale 文件不存在，切回 source language 仍同步显示源码文案。
- `cache.json` 不含 `files` 和冗余 `source` 字段。
- 修改 source language 后，已有目标翻译可以反向成为新 source 的目标翻译。
- `extracted/` 下只生成单层 JSON 文件，且相似路径不会覆盖。
- React Compiler 项目切换语言后，所有 `useI18n()` 消费者同时更新。
- Core、Vite、MCP、文档与两份 ai-i18n 项目技能使用同一协议。
