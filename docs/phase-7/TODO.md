# Phase 7 TODO

> 对应文档：[PRD](./PRD.md)

- [x] 定义 Translation Memory 与 extracted schema v1。
- [x] 新增共享跨进程事务入口。
- [x] 使用 `fs-native-extensions` 锁定稳定 sidecar。
- [x] 使用 `atomically` 替换手写临时文件与 rename 重试。
- [x] Vite 在锁内合并磁盘真相、Provider 结果和结构更新。
- [x] MCP 的翻译设置与清空只在锁内写 `translations.json`。
- [x] 新增独立 `overrides.json`，人工审校不再污染 AI Translation Memory。
- [x] 为带 comment 的消息实现 `byId > default > AI` 优先级。
- [x] MCP 的人工设置与删除只在锁内写 `overrides.json`，并支持 `default` 与 `message`
      两种 scope。
- [x] locales 改为单向派生产物。
- [x] 增加并发、人工审校、幂等和派生文件回归测试。
- [x] 删除未发布协议的迁移与兼容分支。
- [x] 更新用户文档、MCP 契约与两份 Agent skill。
- [x] 完成 DropRoom Windows Dev/Build 外部验收。
