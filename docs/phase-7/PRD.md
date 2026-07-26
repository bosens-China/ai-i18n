# Phase 7 PRD：并发安全 Translation Memory

> 状态：Implemented

## 1. 背景

翻译曾同时写入多个 JSON 文件。Vite Provider、MCP 和外部编辑都可能先读旧快照，再整文件
写回。临时文件和原子 rename 只能保证文件完整，不能阻止后写进程覆盖其他进程刚提交的字段。

## 2. 协议

```text
i18n/
├── translations.json   # AI / Provider Translation Memory
├── overrides.json      # 人工审校
├── extracted/*.json    # 插件生成的单层源码结构，不含译文
└── locales/**          # 插件根据活动结构、Memory 与人工覆盖生成
```

- `translations.json` 使用 schema v1：`version`、`revision`、`messages`。
- `overrides.json` 使用 schema v1：按 source 保存 `default`，按显式 ID 保存 `byId`。
- extracted 使用 schema v1，消息只含 `id`、`source`、可选 `comment` 与 `locations`。
- locales 保持 schema v1，但不再作为反向写入 Translation Memory 的入口。
- `cache` 配置控制 `translations.json` 的容量限制。

## 3. 写事务

Vite 与 MCP 必须统一调用 `@ai-i18n/core/translation-memory`：

1. 对目标绝对路径计算稳定锁名，锁文件放在系统临时目录。
2. 用 `fs-native-extensions` 取得独占 advisory lock。
3. 取得锁后重新读取和校验最新 JSON。
4. 普通补译只填充缺失字段；已提交的非空值优先。
5. 内容实际变化时递增 `revision`。
6. 用 `atomically` 写入并原子替换，不预删目标、不自动 chmod/chown。
7. finally 中释放锁并关闭文件句柄。

内存 ProjectState 只用于加速读取和 Runtime 更新，不是写入真相。

## 4. 人工审校与显式 ID

- `ai_i18n_write_translations` 默认为 `mode: "fill"`，拒绝覆盖不同的非空值。
- 人工确认新文案后，使用 `mode: "review"` 写 `overrides.json`，不改 AI Memory。
- `review_scope: "default"` 影响同一 source 的全部调用。
- `review_scope: "message"` 只接受 `t(source, { id })` 产生的显式 ID。
- 最终优先级为 `byId > default > translations.json > null/source fallback`。
- 缺少覆盖字段表示继续回退；空字符串是有效人工译文。

普通 `t(source)` 继续以 source 为 ID。补充翻译语境时传静态 `{ comment }`；只有同一原文
确有不同语义时才传 `{ id, comment? }`。同一显式 ID 不能映射到不同 source。

## 5. 验收

- 多个并发事务修改不同消息时不丢字段，最终 JSON 始终合法。
- MCP 与 Vite 都不直接整文件覆盖锁外快照。
- MCP 的 fill 只修改 translations，review 只修改 overrides，不修改 extracted 或 locales。
- 外部修改 locales 不会反向污染 Translation Memory。
- 人工默认覆盖与显式 ID 覆盖可以共存，Provider 和普通补译不能回退审校结果。
- 只接受当前 schema，不包含旧协议迁移代码。
- Windows DropRoom Dev/Build 能生成四类协议文件并通过实际翻译与人工覆盖验证。

## 6. 非目标

- Redis、SQLite、常驻内存服务或远程 Translation Memory。
- 自动决定同一 message + locale 哪个不同译文更好。
- 协调不使用共享事务的第三方任意文件写入器。
