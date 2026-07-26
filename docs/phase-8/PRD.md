# Phase 8：开发者诊断中英文切换

状态：Passed。

## 目标

统一 Analyzer、ESLint 与 Vite 的开发者提示和报错。默认根据 Node 进程时区选择中文或
英文，并允许通过环境变量固定语言。

## 契约

- `AI_I18N_DIAGNOSTIC_LOCALE` 接受 `auto`、`zh-CN` 或 `en-US`。
- 未设置或设为 `auto` 时，`Asia/Shanghai` 与 `Asia/Urumqi` 使用中文，其他时区使用英文。
- 不按 UTC 偏移判断语言，避免把其他 UTC+8 地区误判为中文。
- ESLint 保留现有 `messageId`、severity 和定位信息。
- Vite 保留 `[ai-i18n]` 前缀、warning/error 类型和源码位置。
- 第三方 Parser、编译器与 Provider 的原始错误作为原因保留，不改写其内容。

## 非目标

- 不根据构建机器时区切换浏览器 Runtime 错误。
- 不修改 MCP 工具描述、工具契约或 OpenAI Provider 的底层公共错误。
- 不增加 Vite 与 ESLint 各自的语言配置项。
- 不输出语言检测启动横幅。
