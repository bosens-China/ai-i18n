# @ai-i18n/mcp

## [1.0.0-alpha.9](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.8...mcp-v1.0.0-alpha.9) (2026-07-30)


### Features

* **mcp:** use public message references ([d81ae8a](https://github.com/bosens-China/ai-i18n/commit/d81ae8a17a6d1943d927eb0948aeb53996df8d58))

## [1.0.0-alpha.8](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.7...mcp-v1.0.0-alpha.8) (2026-07-29)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.6

## [1.0.0-alpha.7](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.6...mcp-v1.0.0-alpha.7) (2026-07-29)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.5

## [1.0.0-alpha.6](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.5...mcp-v1.0.0-alpha.6) (2026-07-27)


### ⚠ BREAKING CHANGES

* **mcp:** MCP tools now use six focused CRUD operations; ai_i18n_list_translation_files is replaced by ai_i18n_list_translations and mode/review_scope are removed.

### Features

* **mcp:** 重构翻译与人工审校工具 ([dd19f37](https://github.com/bosens-China/ai-i18n/commit/dd19f3730f7ff63af68be79355d04a50f4f6c112))

## [1.0.0-alpha.5](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.4...mcp-v1.0.0-alpha.5) (2026-07-26)


### ⚠ BREAKING CHANGES

* 统一消息标识与 Translator 契约
* 精简 Runtime、Vite 与 MCP 接口

### Features

* 支持并发安全的翻译内存与人工审校 ([8dfcc94](https://github.com/bosens-China/ai-i18n/commit/8dfcc94b4f2986b8b9c71c7596726e5f3d2a1430))
* 收紧翻译协议与消息参数契约 ([b5e51b8](https://github.com/bosens-China/ai-i18n/commit/b5e51b87b98623035acf852cb28a2ce6852e2644))
* 精简 Runtime、Vite 与 MCP 接口 ([d724b0a](https://github.com/bosens-China/ai-i18n/commit/d724b0a4066dfb82eb81398f2623f423039f26db))
* 统一消息标识与 Translator 契约 ([8468555](https://github.com/bosens-China/ai-i18n/commit/8468555daa4f0ed2acd08a7ec0df65d20bb8266d))


### Bug Fixes

* **mcp:** 规范缺失语言并精简项目加载 ([a1e48a6](https://github.com/bosens-China/ai-i18n/commit/a1e48a6b4d79e00966f24b42ad66ada1d53c84f1))
* 统一跨平台稳定排序 ([af47704](https://github.com/bosens-China/ai-i18n/commit/af4770412012f8e15d652047c5b1938656d59013))
* 避免模板占位符字面量冲突 ([bea949f](https://github.com/bosens-China/ai-i18n/commit/bea949fca30cef02c5058641c708c33e23216411))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.4

## [1.0.0-alpha.4](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.3...mcp-v1.0.0-alpha.4) (2026-07-25)


### Features

* **mcp:** discover workspace protocol directories ([8f5d819](https://github.com/bosens-China/ai-i18n/commit/8f5d819d12e2b14db117139eb078247b3e9a6107))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.3

## [1.0.0-alpha.3](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.2...mcp-v1.0.0-alpha.3) (2026-07-24)


### Features

* **mcp:** 适配单层 extracted 文件路径规则与 Schema v2 ([37100a3](https://github.com/bosens-China/ai-i18n/commit/37100a3ec826369ae4f487cc47f5a1f7664a04a3))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.2

## [1.0.0-alpha.2](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.1...mcp-v1.0.0-alpha.2) (2026-07-24)


### Features

* **mcp:** 改为零参数注册与绝对目录调用 ([17d4c9a](https://github.com/bosens-China/ai-i18n/commit/17d4c9acdf646272418af4b46e5697f9ff90d180))

## [1.0.0-alpha.1](https://github.com/bosens-China/ai-i18n/compare/mcp-v1.0.0-alpha.0...mcp-v1.0.0-alpha.1) (2026-07-24)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.1

## 1.0.0-alpha.0

### Major Changes

- 47504fb: 发布首个 Vite 8 浏览器 Runtime alpha，包含 Vanilla/Vue/React 三种互斥模式、HTML、自动导入、OpenAI-compatible Provider、ESLint 静态检查和独立 MCP 服务。

### Patch Changes

- Updated dependencies [47504fb]
  - @ai-i18n/core@1.0.0-alpha.0
