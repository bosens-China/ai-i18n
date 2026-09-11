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

## 性能报告与插件对比

React、Vue、Vanilla 三个演示在普通 Dev / Build 中均开启 `diagnostics.performance`。
终端显示阶段汇总，详细报告位于各自的 `logs/performance/`；已由仓库 Git 忽略规则覆盖。
只想使用演示而不采集时，在对应 Vite 配置中将 `diagnostics.performance` 改为 `false`。

从仓库根目录直接启动观测或运行对照（两者都会先构建当前插件）：

```sh
pnpm examples:perf
pnpm perf:examples --runs=5
```

`examples:perf` 启动三套可正常使用的演示；打开页面才会触发源码转换。
单个演示也提供 `dev:perf` 脚本，使用前先从根目录构建当前包。

对照支持 3–30 轮，默认 5 轮。脚本依次测量 Vanilla、React、Vue，每组预热一次，再交替执行：

| 组别    | ai-i18n | 性能采集 |
| ------- | ------- | -------- |
| off     | 关闭    | 关闭     |
| on      | 开启    | 关闭     |
| profile | 开启    | 开启     |

每个样本启动独立 Node 进程，在演示的临时副本中使用现有 Translation Memory；
项目生成目录和 Vite 缓存从空目录开始。操作系统文件缓存经过预热，因此这不是磁盘完全冷启动。
临时副本正常结束会自动删除，真实演示的源码与译文不会被测量脚本修改。
三组保留相同配置模块的静态依赖导入，仅改变插件注册与采集开关；因此不衡量卸载 ai-i18n 包所节省的模块导入时间。
三组统一关闭 Review、依赖预构建、自动预转换及文件监听，不发起模型请求。
Vue / React 的框架插件和其他已有转换插件继续保留。

| 指标                     | 测量范围                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `startupMs`              | 从调用 Vite `createServer()` 到 `listen()` 完成，包含配置加载；不包含 Node / Vite 模块导入和复制夹具 |
| `firstTransformMs`       | HTML 转换加上 src 中全部受测源码/CSS 的首次顺序转换，包含首次请求等待插件就绪                        |
| `cachedTransformMs`      | 同一批源码的重复请求，主要反映 Vite 转换缓存                                                         |
| `invalidatedTransformMs` | 显式使 Vite 模块缓存失效后再次转换相同源码，观察插件分析缓存复用                                     |

报告聚焦配置、初始化与转换，不单独采集写入和持久化排队。后台写入正常执行，
最后等待完成仅用于清理；上层流程的必要写入等待仍包含在经过时间中。
转换阶段另外按分析缓存是否命中分组，避免混淆首次与重复转换。

模块转换通过 `transformRequest` 直接调用，不包含 HTTP、依赖执行、浏览器渲染或语言切换。
这些演示本身依赖 `virtual:ai-i18n`，off 组仅提供解析占位模块让服务端转换成立；它不是
可运行的浏览器 Runtime。脚本内部的 `AI_I18N_BENCHMARK` 与 `benchmark-*` 模式组合仅供测量使用，不用于浏览器验收。

结果保存到根目录 `logs/performance-comparison/<时间>/`：

- `comparison.md`：各指标三组中位数、插件内部阶段分布，以及 `on - off` 和 `profile - on` 的绝对差值。
- `comparison.json`：环境、测量口径和原始样本，便于之后比较版本。
- `*.profile.json`：对应 profile 样本的插件阶段明细。

差值允许为负，不把系统抖动伪装成零或性能优化。先检查原始样本和机器负载，再判断持续退化。
不同框架的示例规模、语言数和配置不同，只比较每个示例自己的三组结果。
本脚本不自动设置 CI 性能失败阈值。普通演示包含 Review 和预构建，启动时间可能与该隔离基准不同。
