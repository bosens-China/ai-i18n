# Review 开关示例

三个示例分别演示 `aiI18nReview()` 的终端 URL 提示与页面入口开关：

| 示例    | `printUrl` | `launcher` | 预期行为                                             |
| ------- | ---------- | ---------- | ---------------------------------------------------- |
| Vanilla | `true`     | `false`    | 终端打印 Review 地址，业务页面不显示入口             |
| Vue     | `false`    | `true`     | 终端不打印 Review 地址，业务页面右下角显示可点击入口 |
| React   | `false`    | `false`    | 两种提示都关闭，但 Review 服务仍然可用               |

只要注册了 `aiI18nReview()`，开关只影响如何提示入口，不会关闭独立 Review 页面和 API。启动示例后可以直接访问：

- Vanilla：<http://localhost:51881/__ai-i18n/>
- Vue：<http://localhost:51882/__ai-i18n/>
- React：<http://localhost:51883/__ai-i18n/>

如果要彻底关闭 Review 服务，请从 Vite `plugins` 中移除 `aiI18nReview()`。
