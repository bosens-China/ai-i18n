---
title: 语言分包与按需加载
description: 使用 loading 按 locale 拆分 Vite chunk，并在切换语言时展示 Loading 状态
---

默认情况下，ai-i18n 会把所有目标语言注册到同一个 Runtime。配置 `loading` 后，每个目标
locale 会生成独立的 Vite chunk；未提前加载的语言会在首次 `setLang()` 时按需加载。

## 配置分包策略

```ts
// vite.config.ts
import { aiI18n } from '@ai-i18n/vite';

aiI18n({
  sourceLang: 'zh-CN', // source locale 同步可用，不生成独立语言 chunk
  // value 是语言标识，label 是界面中的展示名称。
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
    { value: 'fr-FR', label: 'Français' },
  ],
  loading: {
    // 启用按 locale 分包并声明资源加载提示
    preload: ['en-US'], // 通过 modulepreload 尽早准备
    prefetch: ['ja-JP'], // 通过 prefetch 低优先级缓存
  },
});
```

| 语言    | 加载方式                                                                   |
| ------- | -------------------------------------------------------------------------- |
| `zh-CN` | source locale，不生成语言 chunk                                            |
| `en-US` | 通过 `modulepreload` 尽早准备；非 source 的 `defaultLang` 也会自动 preload |
| `ja-JP` | 通过 `prefetch` 提示浏览器低优先级缓存                                     |
| `fr-FR` | 首次调用 `setLang('fr-FR')` 时加载                                         |

`modulepreload` 与 `prefetch` 都是浏览器调度提示，不保证资源在某个时刻已经完成下载。

如果 `defaultLang` 保持 source，并希望所有目标语言都在切换时再加载，只需传入空对象：

```ts
aiI18n({
  sourceLang: 'zh-CN', // 默认语言保持 source
  locales, // 复用上方完整语言列表
  loading: {}, // 启用分包，其他目标语言首次 setLang() 时再加载
});
```

省略 `loading` 并不等于 `loading: {}`。前者保留默认的全语言注册模式，后者会启用分包，
并让未指定的目标语言完全按需加载。

## 显示切换中的 Loading 状态

`setLang()` 返回 Promise。目标语言 chunk 尚未加载时，它会等待资源完成；成功后才切换语言
并通知组件更新。下面的 Vue 示例在等待期间禁用按钮并显示状态：

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';
import { ref } from 'vue';

const { setLang, t } = useI18n(); // setLang() 返回语言包加载 Promise
const switching = ref(false); // 控制按钮禁用与 Loading 文案
const loadError = ref(''); // 保存可展示的加载错误

async function switchToFrench() {
  switching.value = true;
  loadError.value = '';

  try {
    await setLang('fr-FR');
  } catch {
    loadError.value = t('语言包加载失败，请重试');
  } finally {
    switching.value = false;
  }
}
</script>

<template>
  <button :disabled="switching" @click="switchToFrench">
    {{ switching ? t('正在加载语言包…') : t('切换到法语') }}
  </button>
  <p v-if="loadError">{{ loadError }}</p>
</template>
```

加载失败时，Runtime 会保留当前语言并让 Promise reject。应用可以像上例一样捕获错误，
展示重试入口。

## 配置规则

- `preload` 与 `prefetch` 只能填写 `locales` 中的目标 locale，不能填写 `sourceLang`。
- 同一 locale 不能同时出现在两个列表中；同一列表内的重复值会自动去重。
- 非 source 的 `defaultLang` 会自动按 preload 处理。资源就绪前先渲染 source fallback，
  加载完成后再通知订阅者更新。
- 相同 locale 的并发加载会共享 Promise。不同 locale 的并发切换以最后一次
  `setLang()` 调用为准。
- 缺失或值为 `null` 的译文始终回退到 source 文案。

完整字段类型与边界见
[`AiI18nLocaleLoadingOptions`](/api/vite/interfaces/ai-i18n-locale-loading-options)。
