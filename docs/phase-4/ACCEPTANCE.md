# Phase 4 验收

> 状态：Implemented

> 2026-07-26 API 收敛：移除浏览器语言探测和可配置缺译策略；初始语言仅由有效持久化值或
> `defaultLang` 决定，缺译固定返回 source。

## 自动化检查

- `pnpm test`：26 个测试文件、183 个测试通过。
- `pnpm check`：全包构建、根与 workspace TypeScript / ESLint、publint、attw 及
  Vanilla / Vue / React 示例检查通过。
- `pnpm docs:build`：三个示例生产构建与 Rspress web、node、node_md 构建通过。

## 关键回归

- 使用本地构建的插件与 DropRoom 真实源码、React、UnoCSS、TanStack 插件链完成 Windows
  生产构建；输出隔离到临时目录，未改动 DropRoom。
- DropRoom 构建得到 23 个 extracted 文件、132 条活动消息；cache、extracted 与
  `en-US` locale 均为 132 条且 ID 集合完全一致。
- DropRoom 生成声明直接引用 `@ai-i18n/vite/react` 的稳定 `UseI18n` 类型。
- DropRoom 使用 `aiI18nVitest()` 替代手写 alias 后，20 个测试文件、60 个测试通过。

## 已知边界

- 第三方组件库 locale 仍由应用层同步。
- 已保存到业务 state 的译后字符串不会自动更新。
