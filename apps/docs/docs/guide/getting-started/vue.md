---
title: Vue 快速上手
description: 从 create-vite 创建 Vue 3 项目，并完成 ai-i18n 配置、翻译与 Build 验证
---

## 创建项目

下面以 pnpm 和 Vite 的 `vue-ts` 模板为例：

```sh
pnpm create vite ai-i18n-vue --template vue-ts
cd ai-i18n-vue
pnpm install
pnpm add @ai-i18n/vite@alpha
```

项目尚未发布正式版。正式版发布前请保留 `@alpha`，避免安装到较旧的 `latest`。

已有 Vite + Vue 项目可以跳过创建步骤，直接安装 `@ai-i18n/vite@alpha`。请保留现有的
`@vitejs/plugin-vue`，无需安装额外的 ai-i18n Vue 适配包。

## 配置 Vite

在 `vite.config.ts` 中注册 `aiI18n()`：

```ts
import { aiI18n } from '@ai-i18n/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
    vue(),
  ],
});
```

ai-i18n 会从最终的 Vite 插件列表识别 Vue 模式。只有自定义插件环境无法识别时，才需要显式
设置 `framework: 'vue'`。

## 编写第一个翻译组件

将 `src/App.vue` 替换为：

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';

const { currentLang, langs, setLang, t } = useI18n();

async function changeLanguage(value: string) {
  try {
    await setLang(value);
  } catch {
    // 切换失败时保留当前语言；完整项目可显示 langLoadState 中的错误。
  }
}
</script>

<template>
  <main>
    <p>{{ t('保存') }}</p>
    <select
      :value="currentLang"
      @change="changeLanguage(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="lang in langs" :key="lang.value" :value="lang.value">
        {{ lang.label }}
      </option>
    </select>
  </main>
</template>
```

`useI18n()` 返回的 `currentLang` 和 `langs` 是只读 Ref，在模板中会自动解包。组件需要展示
随语言变化的文案时，应使用 `useI18n()` 返回的 `t`。不要在渲染路径中只调用 Runtime 顶层
`t`，否则组件不会建立订阅。

## 运行与验证

```sh
pnpm dev
pnpm build
```

打开开发页面后切换语言。缺少目标译文时，`t()` 会先回退源码文案。首次接入后执行完整
Build，确认入口可达源码均已提取，并检查以下文件：

```text
src/ai-i18n.d.ts
i18n/translations.json
i18n/overrides.json
i18n/extracted/
i18n/locales/
```

应提交前三类声明或权威译文文件，忽略可重新生成的 `extracted/` 与 `locales/`。完整规则见
[目录说明](/guide/basic/directory)。

## 接入 UI 组件库

ai-i18n 负责业务文案，组件库内置文案仍由组件库自己的 locale 控制。常见组件库都可以从
`currentLang` 派生 locale，再传给根部的 Config Provider：

| 组件库         | Config Provider    | Locale 模块                     |
| -------------- | ------------------ | ------------------------------- |
| Element Plus   | `ElConfigProvider` | `element-plus/es/locale/lang/*` |
| Ant Design Vue | `ConfigProvider`   | `ant-design-vue/es/locale/*`    |

以 Element Plus 为例：

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { ElConfigProvider } from 'element-plus';
import en from 'element-plus/es/locale/lang/en';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { useI18n } from 'virtual:ai-i18n';

const { currentLang } = useI18n();
const uiLocale = computed(() => (currentLang.value === 'en-US' ? en : zhCn));
</script>

<template>
  <ElConfigProvider :locale="uiLocale">
    <RouterView />
  </ElConfigProvider>
</template>
```

Ant Design Vue 使用相同方式，把 locale 传给 `ConfigProvider`。日期组件还需同步 Day.js 等
日期库的 locale。

## 下一步

- [Vue 常见问题](/guide/faq/vue)：排查模板 binding、响应式更新和 `tRef()`。
- [自动导入](/guide/basic/auto-import)：显式开启后省略 `useI18n` import。
- [Vue 在线演示](/demo/vue)：查看可交互的完整示例。
