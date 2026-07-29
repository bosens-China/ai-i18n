# @ai-i18n/vite

## [1.0.0-alpha.8](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.7...vite-v1.0.0-alpha.8) (2026-07-29)


### Features

* 新增 Vue tRef 响应式翻译 API ([e03a48b](https://github.com/bosens-China/ai-i18n/commit/e03a48b75a2b94c80f22af90598ab02b6acb5076))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.6

## [1.0.0-alpha.7](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.6...vite-v1.0.0-alpha.7) (2026-07-29)


### Features

* 完善框架运行时与 ESLint 生命周期诊断 ([b2f51a9](https://github.com/bosens-China/ai-i18n/commit/b2f51a92b2254cd8387d2dee6ba5d2b3013da36a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.5
    * @ai-i18n/core bumped to 1.0.0-alpha.5

## [1.0.0-alpha.6](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.5...vite-v1.0.0-alpha.6) (2026-07-27)


### Features

* **vite:** 导出公开 Translator 契约类型 ([64e6c1a](https://github.com/bosens-China/ai-i18n/commit/64e6c1aee317b8254e6cc8626b4e6b029479c0dc))


### Bug Fixes

* **vite:** 改为显式开启自动导入 ([afd6044](https://github.com/bosens-China/ai-i18n/commit/afd60447690afece9ca1f9cc43e19c09832f2e4b))

## [1.0.0-alpha.5](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.4...vite-v1.0.0-alpha.5) (2026-07-26)


### ⚠ BREAKING CHANGES

* 统一消息标识与 Translator 契约
* 精简 Runtime、Vite 与 MCP 接口

### Features

* **openai:** 按语言集合合并翻译请求 ([8521bcb](https://github.com/bosens-China/ai-i18n/commit/8521bcbd87b604f076278a6ffa50e8bfb91fbaee))
* 支持并发安全的翻译内存与人工审校 ([8dfcc94](https://github.com/bosens-China/ai-i18n/commit/8dfcc94b4f2986b8b9c71c7596726e5f3d2a1430))
* 支持开发者诊断中英文切换 ([3c6fb8f](https://github.com/bosens-China/ai-i18n/commit/3c6fb8f2c2181417774a787abeb035a89110c456))
* 支持静态消息集合宏与推荐语法检查 ([5ddfc49](https://github.com/bosens-China/ai-i18n/commit/5ddfc49968dffc5c93b0c78035f1b33b9841b242))
* 收紧翻译协议与消息参数契约 ([b5e51b8](https://github.com/bosens-China/ai-i18n/commit/b5e51b87b98623035acf852cb28a2ce6852e2644))
* 精简 Runtime、Vite 与 MCP 接口 ([d724b0a](https://github.com/bosens-China/ai-i18n/commit/d724b0a4066dfb82eb81398f2623f423039f26db))
* 统一消息标识与 Translator 契约 ([8468555](https://github.com/bosens-China/ai-i18n/commit/8468555daa4f0ed2acd08a7ec0df65d20bb8266d))


### Bug Fixes

* **vite:** 避免写入过期的 Provider 结果 ([c2316f8](https://github.com/bosens-China/ai-i18n/commit/c2316f89b01de12b40ed7291d4fdb8eb92aeb39f))
* 统一跨平台稳定排序 ([af47704](https://github.com/bosens-China/ai-i18n/commit/af4770412012f8e15d652047c5b1938656d59013))
* 避免模板占位符字面量冲突 ([bea949f](https://github.com/bosens-China/ai-i18n/commit/bea949fca30cef02c5058641c708c33e23216411))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.4
    * @ai-i18n/core bumped to 1.0.0-alpha.4

## [1.0.0-alpha.4](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.3...vite-v1.0.0-alpha.4) (2026-07-25)


### Bug Fixes

* **vite:** 在非 Windows 平台也归一化依赖路径反斜杠 ([8e8e618](https://github.com/bosens-China/ai-i18n/commit/8e8e6184144ded7dbf7faf033cdf51b2d95e343d))

## [1.0.0-alpha.3](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.2...vite-v1.0.0-alpha.3) (2026-07-25)


### Features

* **vite:** improve runtime and extraction reliability ([926734c](https://github.com/bosens-China/ai-i18n/commit/926734cc8a5482a94c685abeca0939b927edc865))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.3
    * @ai-i18n/core bumped to 1.0.0-alpha.3

## [1.0.0-alpha.2](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.1...vite-v1.0.0-alpha.2) (2026-07-24)


### Features

* **vite:** 支持单层 extracted 路径、缓存优化与 React t 引用同步 ([bc2012d](https://github.com/bosens-China/ai-i18n/commit/bc2012d8fd7562d69ad72a6f9c533c0e6e8715ad))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.2
    * @ai-i18n/core bumped to 1.0.0-alpha.2

## [1.0.0-alpha.1](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.0...vite-v1.0.0-alpha.1) (2026-07-24)


### Features

* **vite:** 完成 Phase 2 增量构建、按语言加载与有界缓存 ([b4e59d5](https://github.com/bosens-China/ai-i18n/commit/b4e59d50316eb0525b1d9426b6c2d53cd1e5bf18))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.1
    * @ai-i18n/core bumped to 1.0.0-alpha.1

## 1.0.0-alpha.0

### Major Changes

- 47504fb: 发布首个 Vite 8 浏览器 Runtime alpha，包含 Vanilla/Vue/React 三种互斥模式、HTML、自动导入、OpenAI-compatible Provider、ESLint 静态检查和独立 MCP 服务。

### Patch Changes

- Updated dependencies [47504fb]
  - @ai-i18n/analyzer@1.0.0-alpha.0
  - @ai-i18n/core@1.0.0-alpha.0
