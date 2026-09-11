---
title: 性能诊断
description: 观察插件启动、初始化与源码转换耗时，对比启用前后的差异
---

性能诊断用于回答：插件启动时各个环节用了多久、首次源码转换慢在哪里、
分析缓存命中后还有哪些工作。默认关闭，不需要额外安装依赖。

## 在项目中开启

在已有 `aiI18n()` 配置中增加：

```ts
diagnostics: {
  performance: true,
},
```

然后使用项目原来的 `pnpm dev` 或 `pnpm build`。Dev 启动后打开页面或目标路由，
触发源码转换；只启动服务而不请求页面，通常只能看到初始化。
终端会输出阶段汇总和报告路径。同一次启动持续更新 `logs/performance/<runId>.json`，
正常关闭服务时刷新最后一份报告，下一次启动生成新文件。

如希望只通过指定启动命令采集，可以在 Vite 配置中根据 mode 开启：

```ts
import { defineConfig } from 'vite';
import { aiI18n } from '@ai-i18n/vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    // 保留项目已有的 Vue / React 等插件。
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      diagnostics: { performance: mode === 'performance' },
    }),
  ],
}));
```

在应用的 `package.json` 添加：

```json
{
  "scripts": {
    "dev:perf": "vite --mode performance",
    "build:perf": "vite build --mode performance"
  }
}
```

执行 `pnpm dev:perf` 或 `pnpm build:perf` 即可。`performance` 是这里约定的 Vite mode，
不是插件专用 CLI 参数；使用该方式时同时检查项目的 `.env.performance` 与其他 mode 条件，
确保对比时没有意外改变业务配置。

## 启动仓库演示和开关对照

在 ai-i18n 仓库根目录执行：

```sh
# 自动构建当前包，并同时启动三套演示，打开页面后查看转换阶段
pnpm examples:perf

# 自动构建当前包，再运行三套演示的独立进程对照，完成后退出
pnpm perf:examples --runs=5
```

演示地址为 Vanilla `http://localhost:51881`、Vue `http://localhost:51882`、
React `http://localhost:51883`。三套演示的普通 Dev / Build 也默认开启报告。
只启动某一个演示时，先执行 `pnpm build`，再执行
`pnpm --filter @ai-i18n/example-vue dev:perf`；名称也可换成 `example-react` 或 `example-vanilla`。
演示使用配置中的 `performance: true`，不需要切换 mode。

对照支持 3–30 轮，默认 5 轮，比较关闭插件、开启插件但关闭采集、开启插件并采集三组。
结果在仓库根目录 `logs/performance-comparison/<时间>/comparison.md`，
同目录的 JSON 保存原始样本和详细阶段记录。

| 对照指标                 | 说明                                                         |
| ------------------------ | ------------------------------------------------------------ |
| `startupMs`              | Vite 配置加载到服务监听完成，不包含 Node / Vite 模块导入     |
| `firstTransformMs`       | HTML 与受测源码/CSS 的首次顺序转换，包含首次请求等待初始化   |
| `cachedTransformMs`      | 同一批文件的重复请求，主要反映 Vite 缓存                     |
| `invalidatedTransformMs` | 清除 Vite 转换缓存后再次处理未修改源码，观察插件自身复用情况 |

测量使用临时副本与全新进程，保留现有自动译文；每组预热一次，轮换执行顺序。
不改变原演示源码或译文。三组关闭 Review、Provider 请求、依赖预构建、自动预转换和文件监听，
保留框架插件；不执行浏览器代码。关闭插件的基线只让服务端虚拟模块解析成立，不能用于浏览器功能验收。
它不等于真实页面首屏，也不等于完全冷磁盘启动。普通演示启动保留原配置，和隔离对照的绝对耗时会不同。

## 如何看阶段

| 阶段                                                | 说明                                               |
| --------------------------------------------------- | -------------------------------------------------- |
| `config`                                            | 配置插件运行时依赖的预构建排除项                   |
| `config-resolved`                                   | 确认框架、创建状态与服务、发起异步初始化           |
| `configure-server`                                  | 注册开发服务的目录监听；不包含异步初始化完成的等待 |
| `initialization`                                    | 异步初始化整体，包括读取、必要类型生成与内存恢复   |
| `translation-memory-load` / `overrides-load`        | 读取自动译文 / 人工覆盖                            |
| `state-hydrate`                                     | 恢复内存状态                                       |
| `html-transform` / `source-transform`               | 插件处理 HTML / 单个源码模块的总耗时               |
| `plugin-ready-wait`                                 | 源码转换实际等待初始化完成的时间                   |
| `source-analysis`                                   | 框架源码提取；消息分析也可能发生在状态执行阶段     |
| `dependency-resolution`                             | 解析依赖，可能等待 Vite 转换子模块                 |
| `state-queue-wait` / `state-execute`                | 状态任务排队 / 执行                                |
| `source-registration`                               | 生成源码注册与转换结果                             |
| `hot-update`                                        | 服务端处理文件变更，不代表浏览器渲染完成           |
| `provider-queue-wait` / `provider-call`             | 配置 Provider 时的批次排队 / 翻译调用              |
| `provider-validation` / `provider-results`          | 校验翻译结果 / 应用结果                            |
| `build-start` / `build-reconcile` / `locale-render` | 构建准备 / 活动模块校准 / 语言代码生成             |

**报告不单独统计文件写入、持久化排队与后台批次。** 写入照常执行，初始化、HMR 或构建等上层
阶段如果必须等待写入，仍会包含这段经过时间；这里没有从真实执行时间中扣除写入。
对照结束时会等待后台任务完成以便清理，但不再报告这段清理时间。

对照报告先展示阶段汇总，再按分析缓存是否命中展示转换明细。本演示中分别对应首次与源码不变的
再次转换；`cacheHit` 不代表译文缓存、浏览器缓存或整个转换流程都被跳过。

## 避免误判

- 父阶段包含子阶段，异步工作也可能重叠；不能把累计阶段相加作为启动总时间。
- `config-resolved` 发起初始化后即可返回，异步 `initialization` 可能比它长，不是统计错误。
- 初始化经过时间不等于首次请求被阻塞的时间，要结合 `plugin-ready-wait` 和 HTML 转换看。
- 依赖等待包含其他 Vite 插件的工作，经过时间不等于 ai-i18n 的 CPU 消耗。
- 差值允许为负。先看多轮中位数和机器负载，避免把波动当成性能改善。
- 框架演示规模、语言数与配置不同，应比较同一演示的开关差异。

## 报告设置

```ts
diagnostics: {
  performance: {
    directory: 'logs/performance',
    maxSamples: 2000,
  },
},
```

目录相对 Vite root，不能包含 `..`、不能是绝对路径或位于 i18n 数据目录内，并应加入 `.gitignore`。
`maxSamples` 为 1–10000 的整数。详见
[AiI18nPerformanceDiagnosticsOptions](/api/vite/interfaces/ai-i18n-performance-diagnostics-options)。

次数、累计耗时、最大耗时、错误数与分析缓存命中数覆盖所有已采集完成阶段。
明细、进行中记录与每阶段 P50 / P95 使用有界窗口；样本少时不宜只看分位数。
报告不含源码正文、译文、错误正文、凭据或机器绝对路径。报告写入失败不改变插件结果。
旧会话不会自动删除，排障后可以清理报告目录。

原有 `diagnostics.timing` 仍是独立的 Dev 慢阶段日志，默认阈值 50ms，保留文件同步的诊断能力；
`performance` 的启动/转换采集不受该阈值过滤。排障结束后移除配置或恢复普通启动命令即可。
