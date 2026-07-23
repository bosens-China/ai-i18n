# Phase 1 PRD：Vite 8 渐进式 AI i18n

> 状态：Implemented，等待外部验收
>
> 目标版本：1.0.0-alpha
>
> 六个公开包统一使用正式 npm scope `@boses`。GitHub 仓库仍由
> `bosens-China/ai-i18n` 承载，两者相互独立。

## 1. 背景

现有项目已经具备静态文案提取、上下文消歧、翻译记忆、LLM 翻译、Dev 按需处理和运行时语言切换能力，但实现与 Vue、业务目录和原有落盘方式耦合，无法直接作为通用开源项目维护。

Phase 1 保留核心价值，并将产品重构为只面向 Vite 8、由最终插件列表选择
Vanilla/Vue/React 单一模式的 pnpm monorepo。

## 2. 已确认的产品结论

1. 只支持 Vite 8，不维护旧版 Vite 兼容层。
2. Dev 采用渐进式提取：只处理 Vite 实际请求的模块。
3. Build 采用完整提取：处理 Vite 构建入口可达的完整模块图。
4. Dev 和 Build 都更新工作区中的提取文件、缓存和 locale 文件。
5. 除 `vite dev`、`vite build` 及 Vite 原生命令形态外，不提供额外 CLI。
6. 默认模式为 Vanilla；最终 Vite 插件列表可推断 Vue/React，显式 `framework` 可覆盖推断。
7. 只提取显式 `t()`，不自动扫描普通字符串、JSX 文本或 Vue 模板文本。
8. 相同源文案只翻译一次；`t()` 的第二个注释参数参与 message ID，不同注释视为不同文案。
9. Provider 显式配置后，在 Dev 和 Build 中都会自动运行。
10. Dev Provider 调用必须防抖、批处理、去重且不阻塞首次模块响应。
11. 缺失翻译使用 `null`，运行时确定性回退到源语言。
12. 所有配置语言随模块一起注册，Phase 1 不做语言级懒加载。
13. 不支持 SSR；Runtime 只承诺浏览器客户端行为。
14. 优先采用 Yuku；只有兼容性或正确性验证不通过时才回退 Babel。
15. 不自研 Rust 原生内核。
16. 六个公开包独立版本，使用 tsdown/Rolldown 生成 ESM 与类型声明，并以 publint、ATTW
    和真实 tarball 检查作为发布门禁。
17. 只有独立运行的 `@boses/mcp` 声明 Node 版本；Vite 集成包由 `vite@^8` peer 约束
    配置运行环境，浏览器绑定不重复声明 Node。

## 3. 产品目标

Phase 1 必须交付：

- 可发布、可测试的 pnpm monorepo。
- 框架无关的 Core Runtime 和 Vite 8 插件。
- Vanilla JS/TS、Vue（含 JSX/TSX）和 React JSX/TSX 三种互斥模式。
- 基于宿主 Auto Import 插件的按需导入默认值，以及可强制覆盖的配置。
- 自动生成虚拟模块和全局 API 的 TypeScript 声明。
- Dev 渐进、Build 完整的统一模块状态模型。
- 基于源码路径的 extracted 文件。
- 可提交且包含翻译记忆的 `cache.json`。
- 按语言拆分、由插件生成的 `locales/`。
- 模块级 Runtime 注册与 HMR。
- 自动 Provider 调度、缓存复用、防抖和批处理。
- Vanilla、React、Vue 三个项目示例。

## 4. 非目标

Phase 1 不包括：

- Vite 7 或更低版本兼容。
- Vue 2、React 17 兼容。
- SSR、服务端请求级语言隔离和服务端渲染结果翻译。
- 自动提取未包裹 `t()` 的普通文本。
- 扫描 Vite 构建入口不可达的孤立源码。
- 路由、`src/pages`、Vue Router 或 React Router 目录约定。
- 按语言、路由或 chunk 懒加载翻译。
- Vite Bundled Dev 稳定兼容承诺。
- 翻译管理后台或远程 Translation Memory 服务。
- 独立 scan、sync、generate CLI。
- 自研 Rust/WASM parser。

## 5. 核心语义

### 5.1 只识别显式 `t()`

开发者显式声明可翻译内容：

```ts
import { t } from 'virtual:ai-i18n';

t('保存');
t('保存', '文件保存按钮');
```

提取器必须确认 `t` 来自约定模块，并支持 import alias：

```ts
import { t as translate } from 'virtual:ai-i18n';

translate('保存');
```

其他来源的同名函数不得提取。动态且无法静态求值的参数必须产生 warning，不得猜测结果。

### 5.2 Message ID

Message ID 保持可读，规则为：

```text
无注释：escape(source)
有注释：escape(source) + "#" + escape(comment)
```

示例：

```text
t('保存')                       -> 保存
t('保存', '文件保存按钮')       -> 保存#文件保存按钮
t('保存', '草稿保存按钮')       -> 保存#草稿保存按钮
```

约束：

- ID 不包含文件路径，移动文件不得触发重新翻译。
- 相同 source/comment 在全项目共享一份翻译记忆。
- `undefined`、空注释与无注释等价。
- comment 去除首尾空白后参与 ID，source 保持静态求值后的实际内容。
- key 转义协议必须版本化并有兼容测试。

### 5.3 缺失翻译

翻译值类型为：

```ts
type TranslationValue = string | null;
```

- `null` 表示未翻译。
- `''` 是合法翻译，表示有意显示为空。
- Provider 只处理 `null`。
- 当前语言为 `null` 时，`t()` 回退源语言文案。
- 回退不能依赖用户之前切换过的语言，确保刷新、测试和动态模块行为确定。

## 6. pnpm monorepo

```text
.
├── packages/
│   ├── core/                  # @boses/core
│   ├── analyzer/              # @boses/analyzer，共享静态语义
│   ├── vite/                  # @boses/vite
│   ├── openai/                # @boses/openai，可选 Provider
│   ├── eslint/                # @boses/eslint-plugin，可选静态检查
│   └── mcp/                   # @boses/mcp，本地 Agent 工具
├── examples/
│   ├── vanilla/
│   ├── vue/
│   └── react/
├── apps/
│   └── docs/                  # @boses/docs，Astro Starlight 用户文档站
├── docs/                      # 内部 PRD / TODO / 验收（见 docs/index.md）
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

### 6.1 `@boses/core`

包含：

- Message、Locale、Translator、Extractor 通用类型。
- message ID 创建与转义。
- Translation Memory 合并规则。
- 框架无关 Runtime。
- 模块注册、取消注册和 subscription。
- cache、extracted、locale schema。

不得依赖 Vite、Vue、React、Yuku 或具体 Provider SDK。

### 6.1.1 `@boses/analyzer`

包含 Vite 与 ESLint 共用的 Yuku AST、translation binding、Hook 成员识别、静态字符串求值
和诊断类型。不得依赖 Vite、ESLint、React 或 Vue Runtime；compiler-sfc 只作为 Vue 分析
子入口的可选 peer 注入。

### 6.2 `@boses/vite`

包含：

- Vite 8 插件生命周期。
- 按模式选择 JS/TS、JSX/TSX 和 Vue SFC 分析入口。
- 复用 `@boses/analyzer` 的 Yuku 语义。
- ProjectState、Provider 调度和文件写入。
- Runtime 与模块注册虚拟模块。
- Vue computed/ref 与 React `useSyncExternalStore` Hook adapter。
- HTML 提取快捷配置。
- 框架、Auto Import 插件检测和 TypeScript 声明生成。

Vanilla 模式不得加载 Vue 或 React。Vue/React/compiler 作为可选 peer。

### 6.3 框架 Runtime

Vue 与 React 都从统一虚拟模块导入：

```ts
import { useI18n } from 'virtual:ai-i18n';
```

- Vue 使用 compiler-sfc 分析 SFC，并以 ref/computed 暴露响应式状态。
- Vue JSX/TSX 由宿主 `@vitejs/plugin-vue-jsx` 编译。
- React Hook 基于 Core subscription 和 `useSyncExternalStore`。
- 两种模式都只提取显式 `t()`，不自动处理文本节点。
- 同一个 Vite build 不允许同时出现 Vue 和 React 插件族。

### 6.4 `@boses/openai`

可选 Provider：

```ts
import { openAI } from '@boses/openai';
```

- 使用 `@langchain/openai` 的 `ChatOpenAI` 对接 OpenAI-compatible API，并固定使用
  Chat Completions 与内部 JSON Schema。
- base URL、model 必须显式配置；API key 可省略以连接本地服务，且不得回退读取宿主
  `OPENAI_API_KEY`。
- temperature 默认 `1`，请求超时默认 `120_000ms`，重试次数默认 `3`；支持 max tokens、
  headers 和用户系统提示词。
- 用户系统提示词覆盖默认主体，但 Provider 必须在尾部追加纯 JSON 要求和最小结果示例。
- 可选 LangSmith 配置包含 API key、project、endpoint、workspace ID；传入才启用 tracing。
- Core/Vite 包不依赖 LangChain 或 OpenAI SDK。

### 6.5 `@boses/eslint-plugin`

可选 ESLint flat-config 插件：

- 提供 `t-static-args` 规则，提前报告无法静态提取的 `t()` 参数。
- 直接复用 `@boses/analyzer` 的 binding、alias、成员调用、跨文件常量和动态参数语义。
- `vanilla`、`vue`、`react` flat config 分别声明对应 auto-import 全局并启用同一规则。
- Vue 模式由宿主用 `vue-eslint-parser` 接入 SFC，语义分析与 Vite 共用 compiler-sfc
  结果和 source map。
- Vue SFC 检查覆盖 `<script>`、`<script setup>`、模板插值和指令表达式，并保留原始位置。
- 不默认修改宿主 ESLint 配置，由使用者显式启用。
- 不把 Vue 或 React 的框架 lint 依赖带给其他技术栈。
- 不依赖根私有 package 的旧版导出。

## 7. 框架与 Auto Import 解析

```ts
import { aiI18n } from '@boses/vite';

aiI18n({
  framework: 'vue', // 可省略，由最终 Vite 插件列表推断
  autoImport: true, // 可省略，检测到 unplugin-auto-import 时为 true
  html: true,
});
```

规则：

- 没有检测到框架插件时默认 Vanilla，只分析 JS/TS。
- `vite:vue` 或 `vite:vue-jsx` 推断 Vue；`vite:react*` 推断 React。
- 显式 `framework` 优先于单一插件族推断；两个插件族同时存在时直接报错。
- React 和 Vue Hook binding 都作用于各自模式的完整模块图。
- Vue SFC 使用 compiler-sfc 的真实 script/setup/template 作用域和 source map。
- Hook 返回值支持解构 alias 与 `i18n.t()` 成员调用；外部 Vue `<script src>` 作为独立
  JS/TS 模块进入 Vue 分析链。
- `autoImport` 显式布尔值优先；否则由 `unplugin-auto-import` 插件名启用。
- 外部 Auto Import 只是开关，ai-i18n 自己注入 `virtual:ai-i18n` import。
- auto import 开启时默认生成 `src/ai-i18n.d.ts`，可用 `dts` 改路径或关闭。

## 8. Yuku 解析方案

### 8.1 Phase 1 默认方案

优先使用 `yuku-analyzer`，而不是只替换 `@babel/parser`：

- JS、JSX、TS、TSX 解析。
- AST traversal。
- scope、symbol 和 reference resolution。
- import/export 跨文件链接。
- Dev 中 add/replace/remove file。

`@boses/analyzer` 只保留窄边界：

```ts
analyzeModule(code, id);
extractMessages(module);
```

不把 parser 选择暴露为公共配置，也不为一期设计通用 parser plugin API。

### 8.2 准入门槛

Yuku 必须通过：

- 现有提取 fixtures 结果一致性。
- JS/TS/JSX/TSX、decorators、template literal、dynamic import。
- import alias、re-export、跨文件静态常量。
- macOS、Linux、Windows x64/arm64 安装验证。
- Dev 单文件替换和 Build 完整模块图验证。
- 与 Babel 基线的冷启动、热更新和 Build benchmark。

只有正确性或平台兼容不通过时才回退 Babel；性能提升不足但没有回退风险时，以总体维护成本决定。

### 8.3 Vue 边界

```text
.vue
├── @vue/compiler-sfc：合并 script/setup 并编译 inline template
├── compiler source map：映射回 SFC 原始位置
└── Yuku：统一分析生成的 JS/TS、symbol 和真实局部作用域
```

不使用正则拼接模板表达式，不自研 Vue parser。模板只提取能解析到 `useI18n()` Hook binding
的调用；组件上下文同名 `t`、`v-for`/slot 局部变量和普通文本不提取。外部 `<script src>`
由 Vite 以独立 JS/TS 模块送入默认分析链。普通 `<script>` 内的调用仍会提取，但模板与
Hook 的静态绑定要求使用 `<script setup>`；不追踪 Options API `setup()` 返回对象到模板。

## 9. Vite 扫描与增量

### 9.1 Dev 渐进模型

- 使用 `transform` 和 Vite 8 hook filter，只在模块实际请求时处理。
- 一个源码文件第一次请求时创建 extracted 文件。
- 文件更新只重新分析当前文件及受影响的静态依赖闭包。
- 未访问的动态路由不会在 Dev 启动时扫描。
- Dev 磁盘状态是累计发现结果，不能因为本次 session 未访问就删除文件。

### 9.2 Build 完整模型

- 跟随 Vite/Rolldown 构建入口的完整可达模块图。
- 包含 Vite 能解析的静态和动态 import。
- 不额外 glob 扫描不可达文件。
- Build 完成时校准活动模块、extracted、cache 和 locales。
- Build 不得因为模块当前不可达而删除仍存在的源码文件记录。

### 9.3 复用的 Vite 8 能力

| Vite 能力                 | 用途                                   |
| ------------------------- | -------------------------------------- |
| `transform` + hook filter | 按 Vite 调度提取当前框架模式的源码模块 |
| `transformIndexHtml`      | 处理 HTML entry 和注入 HTML bridge     |
| `this.resolve`            | 复用 alias、条件和其他插件解析         |
| `this.addWatchFile`       | 跟踪跨文件静态依赖                     |
| `hotUpdate`               | 精确失效源码、extracted 和虚拟注册模块 |
| Environment API           | 只在 client 环境创建动态 Runtime       |
| `resolveId` / `load`      | 提供 Runtime 和模块注册虚拟模块        |

不依赖 Vite 私有 module graph 字段或内部缓存格式。

## 10. 模块级注册

### 10.1 转换模型

业务源码：

```ts
t('提交订单', '订单确认按钮');
```

插件概念上转换为：

```ts
import 'virtual:ai-i18n/register?module=src/pages/order.ts';

__aiI18nT('提交订单#订单确认按钮', '提交订单');
```

`__aiI18nT(id, sourceFallback)` 是编译产物使用的内部 helper，不属于开发者公开 API；公开的 `t(source, comment?)` 签名保持不变。

注册虚拟模块在业务模块执行前运行：

```ts
registerModule('src/pages/order.ts', {
  'zh-CN': {
    '提交订单#订单确认按钮': '提交订单',
  },
  'en-US': {
    '提交订单#订单确认按钮': 'Submit order',
  },
  'ja-JP': {
    '提交订单#订单确认按钮': null,
  },
});
```

### 10.2 注册规则

- 只有包含有效 `t()` 的模块才注入注册模块。
- 注册数据包含所有配置语言，Phase 1 不做 locale lazy load。
- Runtime 按 message ID 全局去重，并按 module ID 维护引用。
- 动态 chunk 加载时再注册该 chunk 中模块的 messages。
- HMR 时替换当前 module 的注册数据，不重复累加。
- 模块移除时降低引用计数；没有活动引用时从 Runtime 活动表移除，但 cache 仍保留历史翻译。
- 注入必须保留 directive prologue、shebang 和 sourcemap。

## 11. Provider 调度

框架无关 Provider 契约由 `@boses/core` 导出：

```ts
interface TranslationRequest {
  messageId: string;
  source: string;
  comment?: string;
  locale: string;
}

interface TranslationResult {
  messageId: string;
  locale: string;
  value: string | null;
}

type Translator = (
  requests: readonly TranslationRequest[],
) => Promise<readonly TranslationResult[]>;
```

同一批请求只包含一个目标语言；Provider 不接收缓存、文件路径或当前非空翻译。

### 11.1 自动运行

只要显式配置 `translator`：

- Dev 自动翻译渐进发现的 `null`。
- Build 自动翻译完整可达模块中的 `null`。
- cache 命中直接复用，不调用 Provider。

### 11.2 去重、批次与防抖

调度 key 为：

```text
messageId + targetLocale
```

要求：

- 同一 key 在当前进程只允许一个 in-flight Promise。
- Dev 使用可配置 debounce 收集初始页面连续模块。
- `JSON.stringify({ requests }).length` 达到可配置 batch length 时立即发送；默认 `12_000`，
  单条超限请求独立成批。
- 同时执行的 Provider 批次不得超过可配置并发上限，默认 `5`。
- Provider 按目标语言批量接收唯一 messages。
- 一个批次失败时保持 `null` 并输出 warning，不写入错误字符串。
- Provider 返回必须校验 ID、locale 和值类型。

### 11.3 Dev 非阻塞

Dev 首次模块响应不得等待网络翻译：

1. 立即写入 `null` 并使用源语言响应。
2. 后台防抖、批量调用 Provider。
3. 翻译成功后更新 cache、全部同 ID extracted、locales。
4. 通过 HMR 更新相关注册模块和 UI。

### 11.4 Build 完整性

Build 必须等待当前可达模块所需 Provider 批次完成，再完成最终注册数据和 locale 文件写入。Provider 失败时保留 `null`，构建默认 warning 并继续；可通过严格配置升级为 error。

## 12. 落盘协议

默认目录：

```text
i18n/
├── cache.json
├── extracted/
│   ├── src/pages/home.tsx.json
│   ├── src/views/order.vue.json
│   └── index.html.json
└── locales/
    ├── zh-CN.json
    ├── en-US.json
    └── ja-JP.json
```

三类文件均由 `vite dev` 和 `vite build` 更新。

### 12.1 `cache.json`

`cache.json` 必须提交 Git，它同时承担：

- 文件内容 fingerprint。
- framework/config/schema 版本 fingerprint。
- 文件引用的 message IDs。
- 全项目 Translation Memory。
- 已删除或暂时不活动 message 的历史翻译。

示例：

```json
{
  "version": 1,
  "files": {
    "src/pages/order.ts": {
      "fingerprint": "sha256:...",
      "messageIds": ["提交订单#订单确认按钮"]
    }
  },
  "messages": {
    "提交订单#订单确认按钮": {
      "source": "提交订单",
      "comment": "订单确认按钮",
      "translations": {
        "en-US": "Submit order",
        "ja-JP": null
      }
    }
  }
}
```

不得保存 API key、完整 Prompt、Provider 原始响应、错误响应和绝对路径。

### 12.2 `extracted/**`

extracted 文件按照源码相对路径生成，并作为 Agent/人工编辑入口：

```json
{
  "version": 1,
  "source": "src/pages/order.ts",
  "messages": [
    {
      "id": "提交订单#订单确认按钮",
      "source": "提交订单",
      "comment": "订单确认按钮",
      "locations": [{ "line": 18, "column": 12 }],
      "translations": {
        "en-US": "Submit order",
        "ja-JP": null
      }
    }
  ]
}
```

不保存完整 AST。插件重新提取时必须保留相同 ID 的翻译，并使用 cache 补齐已有结果。

相同 ID 出现在多个文件时：

- 任一文件的新翻译写入 cache。
- 插件同步其他活动 extracted 文件。
- 多个文件存在不同非空值时明确报冲突，不允许 last-write-wins。

### 12.3 `locales/<locale>.json`

locale 文件完全由插件生成，项目和虚拟 Runtime 消费，不作为人工编辑入口：

```json
{
  "locale": {
    "value": "ja-JP",
    "label": "日本語"
  },
  "messages": {
    "提交订单#订单确认按钮": null
  }
}
```

- 源语言文件的值始终是 source。
- 目标语言缺失值保持 `null`。
- 只包含当前活动 message。
- 输出稳定排序。

### 12.4 写入一致性

- 所有写入使用临时文件 + rename。
- 单进程内使用串行 writer queue。
- 写入前重新读取当前磁盘版本，合并 Agent 变更。
- 插件自身写入不得形成 watcher 无限循环。
- cache 最后写入，确保异常中断后下次可以重新校准。

### 12.5 清理

```ts
cleanup: {
  missingSourceFiles: true,
  orphanMessages: false,
}
```

- `missingSourceFiles` 只根据源码是否真实存在判断，不根据 Build 是否访问判断。
- 删除的源码可以删除对应 extracted 和 cache file record。
- `orphanMessages: false` 时保留 cache 中的历史翻译，未来相同 ID 可直接复用。
- 只有显式 `orphanMessages: true` 才删除无人引用的 Translation Memory。

## 13. HTML extractor

HTML 默认不处理；通过选项启用：

```ts
import { aiI18n } from '@boses/vite';

aiI18n({
  html: true,
});
```

### 13.1 显式语法

只处理整个文本节点或整个属性值为静态 `t()` 的内容：

```html
<title>t('能源控制台', 'HTML title')</title>
<div>t('正在加载')</div>
<input placeholder="t('请输入名称')" />
```

不处理：

```html
<div>正在加载</div>
<div>Hello t('world')</div>
<script>
  const example = "t('示例')";
</script>
```

内联 `<script type="module">` 由 Vite JS transform 链处理，不由 HTML extractor 重复解析。

### 13.2 Dev 与 Build

HTML 源文件不在磁盘上被改写。插件使用 `transformIndexHtml`：

- Dev：把 `t()` 替换成源语言文本，附加内部 message marker，并注入最小客户端 bridge。
- Build：把 `t()` 替换成 default language 的翻译；缺失时写源语言，同时保留 marker 和 bridge。
- bridge 注册 HTML module 的全部语言，并订阅 Core Runtime。
- `setLang()` 后只更新带内部 marker 的文本和属性。
- 翻译文本和属性必须经过正确的 HTML escaping。

HTML 同样生成 `extracted/index.html.json`，参与 cache、Provider 去重和 locales 聚合。

## 14. Runtime API

```ts
interface LangOption {
  value: string;
  label: string;
}

interface I18nRuntime {
  t(source: string, comment?: string): string;
  setLang(value: string): Promise<void>;
  getLang(): string;
  getLangs(): readonly LangOption[];
  subscribe(listener: () => void): () => void;
}
```

配置：

```ts
aiI18n({
  sourceLang: 'zh-CN',
  defaultLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
  ],
  html: true,
  translator: openAI({/* user config */}),
  provider: {
    debounceMs: 100,
    batchLength: 12_000,
    maxConcurrency: 5,
    strict: false,
  },
  cleanup: {
    missingSourceFiles: true,
    orphanMessages: false,
  },
});
```

约束：

- locale value 必须唯一。
- sourceLang/defaultLang 必须存在于 locales。
- `getLang()` 返回 value。
- `getLangs()` 返回 label/value，供 UI 渲染。
- `setLang()` 接受 value。
- 所有语言随模块一起注册，但保留异步签名为未来懒加载留出兼容空间。

## 15. SSR 边界

Phase 1 明确只支持浏览器 Runtime：

- 不在 SSR 环境执行全局 `setLang()`。
- 不承诺服务端输出翻译后的 HTML。
- 不实现请求级 locale store。
- SSR transform 可以跳过 Runtime 注入并输出明确诊断。

原因是当前动态 Runtime 使用应用级单例；在服务端共享会产生跨请求状态污染。

## 16. 验收标准

### 16.1 扫描与提取

- Dev 启动不全量扫描源码。
- 访问动态路由后才生成对应 extracted 文件。
- Build 覆盖全部入口可达模块。
- 不提取未绑定或非约定来源的 `t()`。
- 不提取普通 JS 字符串、JSXText、Vue Text 或普通 HTML 文本。

### 16.2 翻译记忆

- 相同 source/comment 在多个文件中只触发一次目标语言翻译。
- 文件移动不会重新翻译。
- 文件删除后 cache 默认仍保留 translation memory。
- Agent 编辑任一 extracted 文件后，相同 ID 的活动文件、cache 和 locales 一致。
- 冲突翻译不会被静默覆盖。

### 16.3 Provider

- Dev 首屏不等待 Provider。
- 连续模块请求被防抖并批量发送。
- batch 满时立即发送。
- 当前进程相同 ID/locale 不产生重复 in-flight 请求。
- Build 在完成前等待必要批次。
- Provider 失败保留 `null`，Runtime 回退源语言。

### 16.4 Runtime 与模块注册

- 只为包含有效 `t()` 的模块生成注册模块。
- Dynamic import 加载后文案可立即使用。
- HMR 不重复累计注册数据。
- `null` 在任何切换历史下都稳定返回源语言。
- 当前框架模式与 HTML 共享同一个 Core Runtime。

### 16.5 文件

- Dev 和 Build 都更新 cache、extracted、locales。
- 三类文件稳定排序并原子写入。
- cache 可提交且不包含 secret、绝对路径和完整 Prompt。
- locales 按语言拆分，缺失项保留 `null`。
- 不存在 sync/scan 独立命令。

### 16.6 包与框架

- 默认安装不加载 Vue/React。
- 无框架插件时默认 Vanilla；Vue/React 官方插件可被自动识别。
- 显式 `framework`、`autoImport` 可以覆盖各自推断结果。
- 检测到 `unplugin-auto-import` 时自动启用内部按需导入。
- 同一个 Vite build 拒绝 Vue/React 插件族混用。
- Vue 模式支持 Vue JSX/TSX，React 模式支持 React JSX/TSX。
- 显式 `virtual:ai-i18n` import 在 auto import 开关之外始终可用。
- TypeScript 声明文件和三种 ESLint globals preset 可用。
- Vanilla、Vue、React 示例均能 dev、build 和切换语言。
- 用户文档站（`apps/docs`）可构建；Pages 部署文档站，并将三示例挂到 `/examples/*`。
- 三个 Pages 示例均展示当前语言、切换控件和随语言变化的非空翻译文案。
- 三个 Pages 示例均通过 `html: true` 提取 `<title>`，并随语言切换更新文档标题。
- SSR 明确标记为不支持。

## 17. 实现阶段不再需要产品确认的默认项

- 工作区目录默认 `i18n/`。
- `cache.json`、`extracted/**`、`locales/**` 均提交 Git。
- Provider debounce 默认 100ms，batch length 默认 `12_000`，并发上限默认 `5`，均可配置。
- 缺失翻译默认 warning，不阻止 Build；严格模式可升级为 error。
- `cleanup.missingSourceFiles` 默认开启，`cleanup.orphanMessages` 默认关闭。
- HTML 只处理完整静态 `t()` 表达式，不支持字符串片段插值。
