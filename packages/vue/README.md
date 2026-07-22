# @ai-i18n/vue

ai-i18n 的 Vue 3 Composition API binding。

```vue
<script setup lang="ts">
import { useI18n } from '@ai-i18n/vue'

const { t, setLang, currentLang, langs } = useI18n()
</script>
```

需要静态提取 SFC 时，项目还应安装 `@ai-i18n/vite`、Vite 8 与 Vue compiler，并在主插件中
组合 `@ai-i18n/vue/vite` 导出的 `vue()`。纯浏览器入口不会加载 Vite/compiler/Yuku。
