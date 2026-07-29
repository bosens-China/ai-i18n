# @ai-i18n/core

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
