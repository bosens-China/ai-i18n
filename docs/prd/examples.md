# 演示示例

## 视觉与交互

- Vanilla、React、Vue 以同一 Fieldnotes 轻量博客展示各自的国际化集成，使用共享 UnoCSS 主题、基础样式和几何插画。
- 桌面与手机均保持正文、语言选择、阅读入口可用；内容自然换行，不依赖横向滚动。
- 业务页面优先展示内容，框架 API 状态与加载错误等演示信息放在辅助区域；Vue 保留 Composition 与纯 Options API 对照。
- 本地远程示例沿用同一视觉主题，保留远程版本、覆盖层、懒加载与失败场景控制。

## 文档与部署

- 在线文档仅嵌入 Vanilla、Vue、React 的静态产物，文档开发与构建均不启动或构建 Hono 示例。
- GitHub Pages 只打包这三个静态示例，不提供 Hono 演示路由或后端控制界面。
- Hono 示例在仓库中维护独立本地运行说明；远程插件的通用接入指南和 API 参考继续保留在文档站。
- 共享 UnoCSS 配置和样式属于各示例的构建输入，变化时必须使缓存失效。

## 权威入口

- [示例与运行说明](../../examples/README.md)
- [本地远程示例](../../examples/remote/README.md)
- [Pages 构建流程](../../.github/workflows/pages.yml)
