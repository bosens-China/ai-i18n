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

## Locale Lazy

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
  ],
  loading: {
    strategy: 'locale',
    preload: ['en-US'],
    prefetch: ['ja-JP'],
  },
});
```

`strategy: 'locale'` 为每个目标 locale 生成独立 Vite chunk。`preload` 使用
`modulepreload` 尽早准备模块，`prefetch` 以较低优先级提示浏览器缓存。其他目标语言在首次
`setLang()` 时加载。source locale 不生成语言资产，也不能出现在两个列表中。

目标语言加载期间继续返回 source fallback；加载成功后再提交切换并通知订阅者。相同 locale
的并发切换共享请求，不同 locale 以最后一次调用为准。非 source 的 `defaultLang` 自动采用
preload 语义。省略 `loading` 时保持全语言注册模式。

## Cache 容量

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  cache: {
    maxMessages: 20_000,
    maxBytes: 10 * 1024 * 1024,
  },
});
```

两个限制都是可选正整数；任一限制超出时，插件按 message ID 稳定淘汰非活跃的
Translation Memory，直到同时满足已配置的限制。`maxBytes` 按稳定序列化后整个
`cache.json` 的 UTF-8 字节数计算。

当前 cache file records 或 ProjectState 引用的 message 始终受保护。若活动数据自身超限，
插件保留数据并输出 warning。省略 `cache` 时不执行容量淘汰；
`cleanup.orphanMessages: true` 仍会优先删除全部非活跃消息。

普通 `vite build` 每次使用新的分析状态；`vite build --watch` 会跨重建复用 ProjectState，
只重新 parse 变化 source，并刷新必要的 reverse dependents。extracted 或目标 locale 文件
变化只合并翻译和注册内容，不重新 parse source。删除、重命名或移除 import 后，插件会校准
当前入口可达模块，同时继续保留可复用的 Translation Memory。Vite 配置、插件、extractor
或 schema 变化后需要重启 Watch 进程。

仅支持 Vite 8 和浏览器 Runtime，不支持 SSR。完整配置与文件协议见仓库根目录 README。
