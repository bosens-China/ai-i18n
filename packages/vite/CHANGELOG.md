# @ai-i18n/vite

## [1.0.0-alpha.37](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.36...vite-v1.0.0-alpha.37) (2026-09-20)


### Bug Fixes

* **analyzer:** 修复 Vue 默认值文案的源码位置映射 ([10f2ea3](https://github.com/bosens-China/ai-i18n/commit/10f2ea3db1ddaae65bdc0079538ff6f9a5b2dd92))


### Performance Improvements

* **vite:** 合并扫描分析并省略浏览器注册工作 ([2ae3ee8](https://github.com/bosens-China/ai-i18n/commit/2ae3ee85e51e21036b74eec6da2a5c9f52fa5081))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.30

## [1.0.0-alpha.36](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.35...vite-v1.0.0-alpha.36) (2026-09-20)


### Bug Fixes

* **vite:** 修复入口扫描兼容性并透传配置加载器 ([a56c9b1](https://github.com/bosens-China/ai-i18n/commit/a56c9b1d961cac50fd6ba2597ba6e3802cf50c83))

## [1.0.0-alpha.35](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.34...vite-v1.0.0-alpha.35) (2026-09-17)


### Features

* **agent:** 打包三平台插件并同步 Skills 与使用文档 ([91da2af](https://github.com/bosens-China/ai-i18n/commit/91da2afdf87ae226d7b6aa5d8c53fe884ced48a1))
* **vite:** 增加入口扫描缓存、构建统计与校对同步 ([350492f](https://github.com/bosens-China/ai-i18n/commit/350492fb41977fa9fb983fc8f7667d498e6e4b64))


### Bug Fixes

* **core:** 防止译文 JSON 重复键静默覆盖 ([d9e3bed](https://github.com/bosens-China/ai-i18n/commit/d9e3bedbd831f86a9ae11d40fbf17cc0ae1ea32c))
* **vite:** 修复连续写入译文时丢失 Dev 更新 ([946aad4](https://github.com/bosens-China/ai-i18n/commit/946aad4c7bafbba76091be05653c9e4946135806))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.29
    * @ai-i18n/core bumped to 1.0.0-alpha.20
  * devDependencies
    * @ai-i18n/sqlite bumped to 1.0.0-alpha.9

## [1.0.0-alpha.34](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.33...vite-v1.0.0-alpha.34) (2026-09-16)


### Bug Fixes

* **vite:** 修复 Dev 译文缓存与缺失统计 ([d0351d5](https://github.com/bosens-China/ai-i18n/commit/d0351d520f9b22ba09d5145205f0ee45b64291a1))

## [1.0.0-alpha.33](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.32...vite-v1.0.0-alpha.33) (2026-09-11)


### Features

* **vite:** 增加启动与转换性能诊断及演示对照 ([08eccc9](https://github.com/bosens-China/ai-i18n/commit/08eccc90326629963a89aed3546df171b954f2a9))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.28

## [1.0.0-alpha.32](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.31...vite-v1.0.0-alpha.32) (2026-09-11)


### Bug Fixes

* **vite:** 过滤内部存储文件事件并修复热更新读取竞态 ([4bea537](https://github.com/bosens-China/ai-i18n/commit/4bea5372bc48952ddee0e2ca7eda3a7014c7c39c))

## [1.0.0-alpha.31](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.30...vite-v1.0.0-alpha.31) (2026-09-07)


### Bug Fixes

* **core:** 修复原型同名文案的提取与持久化 ([7ce33c6](https://github.com/bosens-China/ai-i18n/commit/7ce33c6ad2ed66b488820f60983b47b26d0cbc4e))
* **vite:** 修复出现位置校对的热更新 ([45ddbe5](https://github.com/bosens-China/ai-i18n/commit/45ddbe5f1132a60c98a5c341821e55fd9878785c))
* **vite:** 防止 Provider 旧结果覆盖外部译文修改 ([7a53568](https://github.com/bosens-China/ai-i18n/commit/7a535684d98dd59755894c259cd7bf1326b104a0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.27
    * @ai-i18n/core bumped to 1.0.0-alpha.19
  * devDependencies
    * @ai-i18n/sqlite bumped to 1.0.0-alpha.8

## [1.0.0-alpha.30](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.29...vite-v1.0.0-alpha.30) (2026-09-01)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.26
    * @ai-i18n/core bumped to 1.0.0-alpha.18
  * devDependencies
    * @ai-i18n/sqlite bumped to 1.0.0-alpha.7

## [1.0.0-alpha.29](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.28...vite-v1.0.0-alpha.29) (2026-08-31)


### Bug Fixes

* **diagnostics:** 按当前语言选择诊断文案 ([d709ebb](https://github.com/bosens-China/ai-i18n/commit/d709ebbce590626e68ce1a28b2472ed08c2d795b))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.25
    * @ai-i18n/core bumped to 1.0.0-alpha.17
  * devDependencies
    * @ai-i18n/sqlite bumped to 1.0.0-alpha.6

## [1.0.0-alpha.28](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.27...vite-v1.0.0-alpha.28) (2026-08-31)


### Bug Fixes

* **vite:** 改进静态提取诊断与宏声明 ([a447ff6](https://github.com/bosens-China/ai-i18n/commit/a447ff6b057361b45b826db853fd945b58682e99))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.24

## [1.0.0-alpha.27](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.26...vite-v1.0.0-alpha.27) (2026-08-29)


### Features

* **review-ui:** 支持切换界面语言 ([aad5ac0](https://github.com/bosens-China/ai-i18n/commit/aad5ac073f5657bbb2e942554328f7e4cb26fc40))
* **vite:** 优化控制台诊断配色 ([82485a5](https://github.com/bosens-China/ai-i18n/commit/82485a5273a30182055fd8e6312b6a3d2f332dd2))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.23
    * @ai-i18n/core bumped to 1.0.0-alpha.16
  * devDependencies
    * @ai-i18n/sqlite bumped to 1.0.0-alpha.5

## [1.0.0-alpha.26](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.25...vite-v1.0.0-alpha.26) (2026-08-28)


### Features

* **core:** 使用固定哈希桶存储项目译文 ([e76f40a](https://github.com/bosens-China/ai-i18n/commit/e76f40a199b05ec9ca484190bbc2896ae54cfa44))


### Bug Fixes

* **diagnostics:** 统一开发者诊断语言 ([230cebb](https://github.com/bosens-China/ai-i18n/commit/230cebb121b4ac99fe14596bedaf591ff568c59d))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.22
    * @ai-i18n/core bumped to 1.0.0-alpha.15
  * devDependencies
    * @ai-i18n/sqlite bumped to 1.0.0-alpha.4

## [1.0.0-alpha.25](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.24...vite-v1.0.0-alpha.25) (2026-08-28)


### Features

* **core:** 重构项目译文分片存储 ([5e21b26](https://github.com/bosens-China/ai-i18n/commit/5e21b26b9f47dfa0027b68a0141fb99115c42bb5))
* **review-ui:** 优化独立校对页桌面体验 ([e243aa8](https://github.com/bosens-China/ai-i18n/commit/e243aa84022f09bc65d9baf5233cd42d25b9ba2c))
* **vite:** 恢复 Review 独立入口 ([76644db](https://github.com/bosens-China/ai-i18n/commit/76644dbe170b888facc3e4db531fc30e6009e777))


### Bug Fixes

* **vite:** 修复 Vue 模板属性 occurrence 注入 ([527fd3f](https://github.com/bosens-China/ai-i18n/commit/527fd3fb82aaa5fb8f2e301707f945eb2434c8ef))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.21
    * @ai-i18n/core bumped to 1.0.0-alpha.14
  * devDependencies
    * @ai-i18n/sqlite bumped to 1.0.0-alpha.3

## [1.0.0-alpha.24](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.23...vite-v1.0.0-alpha.24) (2026-08-21)


### Features

* **vite:** 重构 Review 工作台与存储适配器 ([424a005](https://github.com/bosens-China/ai-i18n/commit/424a00563bcc8abd4bf976a23eae75bc48569b8a))
* **vite:** 重构 Review 工作台布局与定位体验 ([e500079](https://github.com/bosens-China/ai-i18n/commit/e500079a380840ee938f446aeaf8ccd981458925))


### Bug Fixes

* **vite:** 修复 Dev 跨文件静态分析冷启动 ([4f70fe5](https://github.com/bosens-China/ai-i18n/commit/4f70fe5d949f88e19bcaf69d20ffb9370da2338d))
* **vite:** 修复 Review 工作台资源加载与样式隔离 ([f7da055](https://github.com/bosens-China/ai-i18n/commit/f7da055fa7bff2141c0e2181a55f8a03617b51b0))
* **vite:** 修复 Vue Options 模板自动导入绑定 ([3c5e02a](https://github.com/bosens-China/ai-i18n/commit/3c5e02ac10957a1c9fed84283cd7c0a2d2ba6f0e))
* **vite:** 清理旧版 extracted 文件命名 ([e2b45d4](https://github.com/bosens-China/ai-i18n/commit/e2b45d46cf897a4feeeb09734f03c5f1b15a5ec4))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.20
    * @ai-i18n/core bumped to 1.0.0-alpha.13
  * devDependencies
    * @ai-i18n/sqlite bumped to 1.0.0-alpha.2

## [1.0.0-alpha.23](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.22...vite-v1.0.0-alpha.23) (2026-08-18)


### Bug Fixes

* **vite:** 优化 Dev 模块加载与状态同步 ([82f06ca](https://github.com/bosens-China/ai-i18n/commit/82f06ca42cbaf4c0fd9eed6bffc2dfc5c82040b0))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.19

## [1.0.0-alpha.22](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.21...vite-v1.0.0-alpha.22) (2026-08-18)


### Bug Fixes

* **vite:** 优化 Dev 持久化与冷启动链路 ([8c69c8a](https://github.com/bosens-China/ai-i18n/commit/8c69c8aef6ae24edfb2446e451a6a1e24d5749fe))

## [1.0.0-alpha.21](https://github.com/bosens-China/ai-i18n/compare/vite-v1.0.0-alpha.20...vite-v1.0.0-alpha.21) (2026-08-17)


### Features

* **vite:** 优化 Dev 管线可靠性与诊断 ([0940ce0](https://github.com/bosens-China/ai-i18n/commit/0940ce02b5c6d018725804300ccd0e665d204d75))


### Bug Fixes

* **deps:** 升级 Vite 插件运行时依赖 ([f7920d4](https://github.com/bosens-China/ai-i18n/commit/f7920d42d312181690214b761fa7873287d4f693))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ai-i18n/analyzer bumped to 1.0.0-alpha.18
    * @ai-i18n/core bumped to 1.0.0-alpha.12

[更早的版本记录](./CHANGELOG-archive.md)
