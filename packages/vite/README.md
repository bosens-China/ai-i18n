# @ai-i18n/vite

Vite 8 的 ai-i18n 主插件。它在 Dev/Build 中提取显式 `t()`，维护可提交 Git 的
`cache.json`、`extracted/**`、`locales/**`，并提供浏览器虚拟 Runtime。

JS、TS、JSX、TSX 默认进入框架中立的共享分析器；Vue/React extractor 只补充对应 Hook
语义，Vue extractor 还负责 SFC 编译。ai-i18n 根据 import binding 自动识别翻译调用，
不要求 JSX 文件使用框架后缀。宿主编译建议以 React 为 fallback，混合项目只给 Vue JSX
插件配置明确的 `include` glob。

识别顺序是：精确 Hook import 决定 ai-i18n 语义；Vue JSX `include` 决定宿主 Vue transform；
未命中 Vue 范围的 JSX 交给 React。Vue-only 项目不启用 React 插件即可。

```ts
import { aiI18n } from '@ai-i18n/vite';

aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
});
```

仅支持 Vite 8 和浏览器 Runtime，不支持 SSR。完整配置与文件协议见仓库根目录 README。
