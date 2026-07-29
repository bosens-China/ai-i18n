# @ai-i18n/analyzer

## [1.0.0-alpha.6](https://github.com/bosens-China/ai-i18n/compare/analyzer-v1.0.0-alpha.5...analyzer-v1.0.0-alpha.6) (2026-07-29)


### Features

* 新增 Vue tRef 响应式翻译 API ([e03a48b](https://github.com/bosens-China/ai-i18n/commit/e03a48b75a2b94c80f22af90598ab02b6acb5076))

## [1.0.0-alpha.5](https://github.com/bosens-China/ai-i18n/compare/analyzer-v1.0.0-alpha.4...analyzer-v1.0.0-alpha.5) (2026-07-29)


### Features

* 完善框架运行时与 ESLint 生命周期诊断 ([b2f51a9](https://github.com/bosens-China/ai-i18n/commit/b2f51a92b2254cd8387d2dee6ba5d2b3013da36a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.5

## [1.0.0-alpha.4](https://github.com/bosens-China/ai-i18n/compare/analyzer-v1.0.0-alpha.3...analyzer-v1.0.0-alpha.4) (2026-07-26)


### ⚠ BREAKING CHANGES

* 统一消息标识与 Translator 契约

### Features

* **analyzer:** 支持可配置的静态候选警告 ([4d76ef8](https://github.com/bosens-China/ai-i18n/commit/4d76ef8005a464a76f4fd77173e4df9c390f8cef))
* 支持并发安全的翻译内存与人工审校 ([8dfcc94](https://github.com/bosens-China/ai-i18n/commit/8dfcc94b4f2986b8b9c71c7596726e5f3d2a1430))
* 支持开发者诊断中英文切换 ([3c6fb8f](https://github.com/bosens-China/ai-i18n/commit/3c6fb8f2c2181417774a787abeb035a89110c456))
* 支持静态消息集合宏与推荐语法检查 ([5ddfc49](https://github.com/bosens-China/ai-i18n/commit/5ddfc49968dffc5c93b0c78035f1b33b9841b242))
* 收紧翻译协议与消息参数契约 ([b5e51b8](https://github.com/bosens-China/ai-i18n/commit/b5e51b87b98623035acf852cb28a2ce6852e2644))
* 统一消息标识与 Translator 契约 ([8468555](https://github.com/bosens-China/ai-i18n/commit/8468555daa4f0ed2acd08a7ec0df65d20bb8266d))


### Bug Fixes

* **analyzer:** 修正静态候选分析边界 ([1691365](https://github.com/bosens-China/ai-i18n/commit/16913659e04d1bfb7427dc81057e7ac1f7e53b74))
* 适配非法诊断语言配置的中英文报错 ([981266b](https://github.com/bosens-China/ai-i18n/commit/981266b5b995be2274dc10086887a208b099dc98))
* 避免模板占位符字面量冲突 ([bea949f](https://github.com/bosens-China/ai-i18n/commit/bea949fca30cef02c5058641c708c33e23216411))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.4

## [1.0.0-alpha.3](https://github.com/bosens-China/ai-i18n/compare/analyzer-v1.0.0-alpha.2...analyzer-v1.0.0-alpha.3) (2026-07-25)


### Features

* **vite:** improve runtime and extraction reliability ([926734c](https://github.com/bosens-China/ai-i18n/commit/926734cc8a5482a94c685abeca0939b927edc865))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.3

## [1.0.0-alpha.2](https://github.com/bosens-China/ai-i18n/compare/analyzer-v1.0.0-alpha.1...analyzer-v1.0.0-alpha.2) (2026-07-24)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/core bumped to 1.0.0-alpha.2

## [1.0.0-alpha.1](https://github.com/bosens-China/ai-i18n/compare/analyzer-v1.0.0-alpha.0...analyzer-v1.0.0-alpha.1) (2026-07-24)


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
