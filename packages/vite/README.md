# @ai-i18n/vite

Vite 8 的 ai-i18n 主插件。它在 Dev/Build 中提取显式 `t()`，维护可提交 Git 的
`cache.json`、`extracted/**`、`locales/**`，并提供浏览器虚拟 Runtime。

```ts
import { aiI18n } from '@ai-i18n/vite'

aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
})
```

仅支持 Vite 8 和浏览器 Runtime，不支持 SSR。完整配置与文件协议见仓库根目录 README。
