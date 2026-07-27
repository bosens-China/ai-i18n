---
title: 目录说明
description: i18n 协议目录、文件职责、Git 提交约定与目录维护方式
---

## 目录协议

默认在 Vite root 下生成：

```text
i18n/
├── translations.json          # AI / Provider Translation Memory
├── overrides.json             # 人工审校值
├── extracted/
│   └── src_example.ts.json    # source / comment / location，不含译文
└── locales/
    └── en-US.json             # 插件生成的最终运行时文案
```

四类文件各做一件事：

- `extracted/*.json` 是单层源码提取清单，只由 Vite 插件维护消息结构。
- `translations.json` 是 AI Translation Memory。Provider 只补缺失值；MCP 默认补缺失值，
  也可在显式授权后覆盖或清空具体字段。
- `overrides.json` 是人工审校文件。MCP 的独立人工审校工具或人工编辑在这里保存最终决定。
- `locales/**` 是运行时产物，只由插件根据 extracted、AI Memory 和人工覆盖生成。

可用 `directory` 修改路径。文件中不包含绝对路径、时间戳、API key、完整 Prompt 或
Provider 原始响应。extracted 文件位于同一层级；路径分隔符编码为 `_`，源码文件名中的
`_` 会单独转义，因此相似路径不会互相覆盖。

`translations.json` 使用消息 ID 作为 key，并用 `revision` 标识成功提交次数：

```json
{
  "version": 1,
  "revision": 12,
  "messages": {
    "8 位房间码": {
      "source": "8 位房间码",
      "sourceLang": "zh-CN",
      "translations": {
        "en-US": "8-digit Room Code"
      }
    }
  }
}
```

`overrides.json` 按原文组织默认人工译文，也可为带 comment 的 message ID 单独指定：

```json
{
  "version": 1,
  "messages": {
    "提交": {
      "default": {
        "en-US": "Submit"
      },
      "byId": {
        "提交#创建 Git 提交": {
          "en-US": "Commit"
        }
      }
    }
  }
}
```

两份译文输入 JSON 都在自己的跨进程锁内重读、按字段修改并原子替换。锁保存在系统临时目录，
不会污染项目或 Git 状态。Vite 和 MCP 的内存数据只是缓存，不能整文件覆盖磁盘新值。

最终译文按 locale 逐项选择：

1. `overrides.json` 中匹配 comment-specific message ID 的 `byId`；
2. 同一原文的人工 `default`；
3. `translations.json` 中该 message ID 的 AI 译文；
4. `null`，Runtime 回退 source 文案。

无 comment 时，message ID 通常就是 source；有 comment 时类似
`提交#创建 Git 提交`。source 或规范化后的 comment 任一变化都会形成新消息并重新翻译。
`#` 与 `\` 会被转义，协议条目仍显式保存 `source`、`comment`、`sourceLang` 和
`translations`，业务数据不依赖解析 key。同一句话需要不同语义时，使用不同的静态
`comment`。

## 目录维护：清理策略与容量限制

```ts
aiI18n({
  cache: {
    // 限制非活跃历史 Translation Memory 的规模
    maxMessages: 20_000, // Translation Memory 最多保留的消息数
    maxBytes: 10 * 1024 * 1024, // translations.json 的 UTF-8 软上限
  },
  cleanup: {
    // 控制失效提取文件与孤立消息的清理
    missingSourceFiles: true, // 删除源文件不存在时对应的 extracted 文件
    orphanMessages: false, // 保留当前源码未引用的历史翻译，便于跨分支复用
  },
});
```

- `cache` 配置限制 `translations.json` 中的历史 Translation Memory。
- 插件只淘汰源码不再引用的非活跃历史；活动文案自身超限时会保留并 warning。
- `missingSourceFiles: true` 会删除源文件已不存在的 extracted。
- 建议保持 `orphanMessages: false`，以便分支切换、文件移动后继续复用历史翻译。

确实要一次性清空历史项时，可临时设置 `cleanup.orphanMessages: true` 运行一次完整 Build，
确认提交结果后再恢复默认。

## Dev 与 Build

- **Dev**：渐进式提取浏览器实际请求到的模块。
- **Build**：使用新的 ProjectState，跟随入口可达模块图完整提取。
- **Build Watch**：复用未变化 source 的 AST，只刷新变化文件、必要依赖方和当前活动集合。

三种模式都会把源码结构写入 extracted，并根据最新 `translations.json` 与 `overrides.json`
重建 locales。运行中的 Dev/Build Watch 发现两类译文文件变化时，会刷新内存状态和运行时
内容，不重新解析未变化源码。

外部修改 extracted 的消息结构或 locales 的译文不会成为权威数据；下一次同步会根据源码和
两类译文文件恢复它们。Vite 配置、插件、extractor 或 schema 变化后需要重启 Watch。

## 应该提交什么

:::important 最小可提交清单
源码变更、生成的 `src/ai-i18n.d.ts`（或自定义 `dts` 路径）、
`i18n/translations.json`、`i18n/overrides.json`、`i18n/extracted/*.json`、`i18n/locales/**`
**应在同一 PR 中提交**。
:::

推荐流程：

1. 运行 `vite dev` 并访问相关页面，或运行 `vite build`，生成最新协议文件。
2. 使用 `ai_i18n_list_translations` 查询缺失消息，再用
   `ai_i18n_set_translations` 补译；默认只填充 `null`。
3. 人工审校不满意的文案时，使用 `ai_i18n_set_overrides`。`scope: "default"` 影响同一
   原文的全部调用；`scope: "message"` 只影响带 comment 的目标消息。删除人工值前先用
   `ai_i18n_list_overrides` 取得 opaque `override_id`。
4. 也可以直接编辑 `overrides.json`。编辑期间应暂停 MCP 写入，避免编辑器绕过共享文件锁；
   不要把人工修订写进 `translations.json`。
5. 再跑一次 Dev 或 Build，让插件重建 locales 并校准 extracted。
6. 源码与四类 i18n 文件一起提交。

:::warning 合并冲突
分支合并时必须保留 `translations.json` 和 `overrides.json`。同一人工覆盖字段出现两个不同
译文时必须人工决定；不能采用整文件后写覆盖。合并后重新执行 Dev 或 Build。
:::

## Agent 协作边界

- Agent 的普通补译只写 `translations.json`，人工审校只写 `overrides.json`。
- `extracted/*.json` 与 `locales/**` 都是插件产物，不接受译文编辑。
- `ai_i18n_set_translations` 默认只填充 `null`；覆盖非空值必须显式传
  `overwrite_existing: true`。只有用户明确要求人工审校时，Agent 才能调用
  `ai_i18n_set_overrides` 或 `ai_i18n_delete_overrides`，并根据影响全部调用还是某个带
  comment 的消息选择 scope。
- 使用约定以本文档和 [接入 Agent](/guide/advanced/ai-tools) 为准。
