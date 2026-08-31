# @ai-i18n/core

## [1.0.0-alpha.17](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.16...core-v1.0.0-alpha.17) (2026-08-31)


### Bug Fixes

* **diagnostics:** 按当前语言选择诊断文案 ([d709ebb](https://github.com/bosens-China/ai-i18n/commit/d709ebbce590626e68ce1a28b2472ed08c2d795b))

## [1.0.0-alpha.16](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.15...core-v1.0.0-alpha.16) (2026-08-29)


### Features

* **review-ui:** 支持切换界面语言 ([aad5ac0](https://github.com/bosens-China/ai-i18n/commit/aad5ac073f5657bbb2e942554328f7e4cb26fc40))

## [1.0.0-alpha.15](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.14...core-v1.0.0-alpha.15) (2026-08-28)


### Features

* **core:** 使用固定哈希桶存储项目译文 ([e76f40a](https://github.com/bosens-China/ai-i18n/commit/e76f40a199b05ec9ca484190bbc2896ae54cfa44))


### Bug Fixes

* **diagnostics:** 统一开发者诊断语言 ([230cebb](https://github.com/bosens-China/ai-i18n/commit/230cebb121b4ac99fe14596bedaf591ff568c59d))

## [1.0.0-alpha.14](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.13...core-v1.0.0-alpha.14) (2026-08-28)


### Features

* **core:** 重构项目译文分片存储 ([5e21b26](https://github.com/bosens-China/ai-i18n/commit/5e21b26b9f47dfa0027b68a0141fb99115c42bb5))
* **review-ui:** 优化独立校对页桌面体验 ([e243aa8](https://github.com/bosens-China/ai-i18n/commit/e243aa84022f09bc65d9baf5233cd42d25b9ba2c))

## [1.0.0-alpha.13](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.12...core-v1.0.0-alpha.13) (2026-08-21)


### Features

* **core:** 增加 Review 主题偏好协议 ([1a9eafe](https://github.com/bosens-China/ai-i18n/commit/1a9eafebb0e5f9577811244b3a9dd639c073e79b))
* **vite:** 重构 Review 工作台与存储适配器 ([424a005](https://github.com/bosens-China/ai-i18n/commit/424a00563bcc8abd4bf976a23eae75bc48569b8a))

## [1.0.0-alpha.12](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.11...core-v1.0.0-alpha.12) (2026-08-17)


### Bug Fixes

* **deps:** 升级 Vite 插件运行时依赖 ([f7920d4](https://github.com/bosens-China/ai-i18n/commit/f7920d42d312181690214b761fa7873287d4f693))

## [1.0.0-alpha.11](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.10...core-v1.0.0-alpha.11) (2026-08-11)


### Features

* **vite:** 添加翻译校对页面 ([2dabbea](https://github.com/bosens-China/ai-i18n/commit/2dabbea82aed4f511095386b3872d814906b402d))

## [1.0.0-alpha.10](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.9...core-v1.0.0-alpha.10) (2026-08-07)


### Features

* 支持文件级人工译文覆盖 ([2b78e41](https://github.com/bosens-China/ai-i18n/commit/2b78e414c04df136d5d9a379459bb9678cec1dc8))

## [1.0.0-alpha.9](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.8...core-v1.0.0-alpha.9) (2026-08-07)


### Bug Fixes

* **core:** 打开存储时迁移旧翻译文件 ([40d33a3](https://github.com/bosens-China/ai-i18n/commit/40d33a3d3cb8b26807a425a962138ea5f2cd191b))

## [1.0.0-alpha.8](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.7...core-v1.0.0-alpha.8) (2026-08-06)


### Features

* **core:** 支持分片 JSON 与全局 SQLite 翻译存储 ([10b4c08](https://github.com/bosens-China/ai-i18n/commit/10b4c08a564a4c92ef6258249abc202c1ff59e04))
* **core:** 默认 JSON 省略存储标记 ([d09dad7](https://github.com/bosens-China/ai-i18n/commit/d09dad722b62304c9914ebb64a98163bb88b68eb))
* **mcp:** 补充翻译上下文与模板校验详情 ([81b0a21](https://github.com/bosens-China/ai-i18n/commit/81b0a210249c9c940c5726319a45095802f96931))
* **vite:** 收紧配置与 Provider 事件契约 ([b8c3661](https://github.com/bosens-China/ai-i18n/commit/b8c36610e50275759888af07c6eaafe0c7a91652))
* 支持可审查的 LLM 日志 ([395d778](https://github.com/bosens-China/ai-i18n/commit/395d778cc256acda757a42e2d954bb0c625a5acb))


### Bug Fixes

* **core:** 增量提交 JSON 翻译分片 ([1f15177](https://github.com/bosens-China/ai-i18n/commit/1f151775874b1e9665995fad440f42dab2669aec))

## [1.0.0-alpha.7](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.6...core-v1.0.0-alpha.7) (2026-08-03)


### Bug Fixes

* **release:** 稳定内部包发布依赖 ([1734156](https://github.com/bosens-China/ai-i18n/commit/1734156fd4cf0926aa2480676f60861da59fd9c1))

## [1.0.0-alpha.6](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.5...core-v1.0.0-alpha.6) (2026-07-29)


### Features

* 支持静态文案树翻译 ([7f5fb09](https://github.com/bosens-China/ai-i18n/commit/7f5fb09b9bc0e8313f5115dfb828fe3259b2264b))

## [1.0.0-alpha.5](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.4...core-v1.0.0-alpha.5) (2026-07-29)


### Features

* 完善框架运行时与 ESLint 生命周期诊断 ([b2f51a9](https://github.com/bosens-China/ai-i18n/commit/b2f51a92b2254cd8387d2dee6ba5d2b3013da36a))

## [1.0.0-alpha.4](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.3...core-v1.0.0-alpha.4) (2026-07-26)


### ⚠ BREAKING CHANGES

* 统一消息标识与 Translator 契约
* 精简 Runtime、Vite 与 MCP 接口

### Features

* 支持并发安全的翻译内存与人工审校 ([8dfcc94](https://github.com/bosens-China/ai-i18n/commit/8dfcc94b4f2986b8b9c71c7596726e5f3d2a1430))
* 收紧翻译协议与消息参数契约 ([b5e51b8](https://github.com/bosens-China/ai-i18n/commit/b5e51b87b98623035acf852cb28a2ce6852e2644))
* 精简 Runtime、Vite 与 MCP 接口 ([d724b0a](https://github.com/bosens-China/ai-i18n/commit/d724b0a4066dfb82eb81398f2623f423039f26db))
* 统一消息标识与 Translator 契约 ([8468555](https://github.com/bosens-China/ai-i18n/commit/8468555daa4f0ed2acd08a7ec0df65d20bb8266d))


### Bug Fixes

* **core:** 隔离 Runtime 语言配置 ([cab20d2](https://github.com/bosens-China/ai-i18n/commit/cab20d201a268b09585d9383772bffe8cdddf4e1))
* 统一跨平台稳定排序 ([af47704](https://github.com/bosens-China/ai-i18n/commit/af4770412012f8e15d652047c5b1938656d59013))
* 避免模板占位符字面量冲突 ([bea949f](https://github.com/bosens-China/ai-i18n/commit/bea949fca30cef02c5058641c708c33e23216411))

## [1.0.0-alpha.3](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.2...core-v1.0.0-alpha.3) (2026-07-25)


### Features

* **vite:** improve runtime and extraction reliability ([926734c](https://github.com/bosens-China/ai-i18n/commit/926734cc8a5482a94c685abeca0939b927edc865))

## [1.0.0-alpha.2](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.1...core-v1.0.0-alpha.2) (2026-07-24)


### Features

* **core:** 升级 Cache 协议至 v2 并优化 Schema ([3c071d4](https://github.com/bosens-China/ai-i18n/commit/3c071d47ce744830a46d94f67a7a733092127457))

## [1.0.0-alpha.1](https://github.com/bosens-China/ai-i18n/compare/core-v1.0.0-alpha.0...core-v1.0.0-alpha.1) (2026-07-24)


### Features

* **vite:** 完成 Phase 2 增量构建、按语言加载与有界缓存 ([b4e59d5](https://github.com/bosens-China/ai-i18n/commit/b4e59d50316eb0525b1d9426b6c2d53cd1e5bf18))

## 1.0.0-alpha.0

### Major Changes

- 47504fb: 发布首个 Vite 8 浏览器 Runtime alpha，包含 Vanilla/Vue/React 三种互斥模式、HTML、自动导入、OpenAI-compatible Provider、ESLint 静态检查和独立 MCP 服务。
