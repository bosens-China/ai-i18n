---
title: TypeScript 与生成声明
description: 接入 ai-i18n 生成声明，并排查虚拟模块、自动导入和 Vue template 类型问题
---

本页只说明 ai-i18n 为 TypeScript 项目增加的内容。通过 Vite 模板创建的项目可以继续使用模板
自带的 TypeScript 配置，不需要为了接入 ai-i18n 重写 `tsconfig`。

## 接入类型声明

首次启动 Vite Dev Server 或执行 Build 后，插件会在 Vite root 下生成声明文件。默认路径是：

```text
src/ai-i18n.d.ts
```

它位于 Vite 模板默认包含的 `src/` 中，因此通常不需要额外配置。业务源码也不应 import
这个 `.d.ts` 文件；正常导入 `virtual:ai-i18n`，或按需开启自动导入即可。

```ts
import { t, useI18n } from 'virtual:ai-i18n';
```

如果编辑器在文件生成后仍保留旧错误，先重启 TypeScript language service 或编辑器，再运行
项目已有的类型检查命令。

## 生成文件各自负责什么

### `ai-i18n.d.ts`

主声明适用于 Vanilla、Vue 和 React，除非显式设置 `dts: false`。它负责：

- 声明 `virtual:ai-i18n` 及当前框架可用的 Runtime API；
- 声明无需 import 的 `defineI18nMessages()` 编译宏；
- 开启 `autoImport: true` 后，为脚本中的自动导入 API 提供全局类型。

这个文件解决的是 TypeScript 脚本作用域中的类型问题。

### `ai-i18n.vue.d.ts`

Vue 模式同时开启 `autoImport: true` 时，还会在主声明旁生成：

```text
src/ai-i18n.d.ts
src/ai-i18n.vue.d.ts
```

第二个文件扩展 Vue 的组件类型，让 Vue language-tools（Volar）与 `vue-tsc` 识别 template
中的裸 `t()`。主声明会引用它，因此两个文件应保持相邻。

这个文件只是 template 的类型桥，不会向组件实例安装 method。即使编辑器能识别
`{{ t('保存') }}`，脚本中也不要改写成 `this.t()` 或 `this.$t()`。

生成声明由插件维护，不要手工修改。是否提交到 Git 以及其他生成文件的归属见
[生成文件与 Git](/guide/basic/directory)。

## 显式导入与自动导入

| 使用方式                  | 脚本类型来源       | Vue template 类型来源                      |
| ------------------------- | ------------------ | ------------------------------------------ |
| 从 `virtual:ai-i18n` 导入 | 主声明中的模块声明 | `<script setup>` 或 Options 的真实 binding |
| `autoImport: true`        | 主声明中的全局声明 | 相邻的 Vue template 类型桥                 |

两种模式都不需要 import `.d.ts` 文件。如何开启自动导入、Options 组件怎样暴露 template
binding，以及本地同名值的遮挡规则统一见[自动导入](/guide/basic/auto-import)。

## 自定义声明路径

只有默认的 `src/ai-i18n.d.ts` 不适合项目目录结构时，才需要设置 `dts`。相对路径基于当前
Vite root；也可以使用绝对路径：

```ts title="vite.config.ts"
aiI18n({
  autoImport: true,
  dts: 'types/web-ai-i18n.d.ts',
});
```

Vue 自动导入模式会在同一目录生成：

```text
types/web-ai-i18n.d.ts
types/web-ai-i18n.vue.d.ts
```

自定义路径不在项目原有 TypeScript 检查范围内时，只需把该目录或两个文件加入实际检查应用
源码的 `include`。不要把文件路径写入 `compilerOptions.types`；该字段用于选择自动加载的
类型包，不用于包含项目内的声明文件。

如果目标位置已有不带 ai-i18n 生成标记的文件，插件会停止并保留原文件。修改 `dts` 路径或
设置 `dts: false` 后，请手工删除旧位置的主声明和相邻 Vue 声明。只有宿主项目自行维护
等价声明时，才建议关闭生成。

## Monorepo

每个独立 Vite build 应生成自己的声明文件，不要让多个应用写入同一路径。

应用私有的 workspace 子包需要使用自动导入时，可以把 `dts` 输出到应用与子包各自的
TypeScript 项目都能包含的位置。Vue 自动导入需要同时包含主声明与相邻的 `.vue.d.ts`。

可被多个应用或独立构建复用的共享包，优先显式导入 `virtual:ai-i18n`。这样共享包不会依赖
某个消费应用提供的全局声明。

## 常见类型问题

### 找不到 `virtual:ai-i18n`

先启动一次 Vite Dev Server 或执行 Build，确认主声明已经生成。默认路径被移动后，确认
新的 `dts` 路径仍在当前 TypeScript 项目的检查范围内。

### 找不到 `defineI18nMessages`

这个名字是由主声明提供的全局编译宏，不需要 import。确认 `ai-i18n.d.ts` 已生成并被当前
TypeScript 项目包含。

### Vue template 找不到 `t`

如果使用显式导入，确认 `<script setup>` 已导入 `t`，或普通 Options 组件已通过
`methods: { t }` 暴露 binding。

如果开启了自动导入，确认主声明旁同时存在 `.vue.d.ts`。两份文件都存在但编辑器仍报错时，
重启 Vue language service，再执行 `vue-tsc` 检查。

### Options API 中 `this` 没有正确类型

TypeScript 组件应使用 `defineComponent()`。如果项目关闭了模板自带的严格检查，至少确认
`noImplicitThis` 没有被关闭，否则 methods、computed 和 watch 中的 `this` 会退化为
`any`。

```ts
import { defineComponent } from 'vue';
import { i18nComputed } from 'virtual:ai-i18n';

export default defineComponent({
  computed: {
    ...i18nComputed(),
  },
});
```

### Options watch 参数被推断为 `any`

Vue 的 Options `watch` 类型不会根据被监听的 key 推断回调参数。请显式标注参数：

```ts
watch: {
  currentLang(next: string, previous: string) {
    console.log(previous, '->', next);
  },
},
```

### 移动声明后仍出现重复或过期类型

插件只维护当前配置指定的位置，无法推断曾经使用过的自定义路径。删除旧的主声明及其相邻
Vue 声明，然后重启类型服务。

## 运行类型检查

Vite 负责转译 TypeScript，不会替代完整的类型检查。项目已有 `type-check` 脚本时优先使用
项目脚本；Vue SFC 项目通常运行 `vue-tsc --noEmit`，React 或 Vanilla 项目通常运行
`tsc --noEmit`。
