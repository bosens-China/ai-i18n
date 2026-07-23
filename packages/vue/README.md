# @ai-i18n/vue

ai-i18n 的 Vue 3 Composition API binding。

```vue
<script setup lang="ts">
import { useI18n } from '@ai-i18n/vue';

const { t, setLang, currentLang, langs } = useI18n();
</script>
```

需要静态提取 SFC 时，项目还应安装 `@ai-i18n/vite`、Vite 8 与 Vue compiler，并在主插件中
组合 `@ai-i18n/vue/vite` 导出的 `vue()`。注册后 Hook binding 同时适用于普通 JS/TS
composable；SFC 使用 compiler-sfc 的真实 script/setup/template 作用域，外部 `<script src>`
按其 JS/TS 文件提取。支持解构 alias 和 `i18n.t()` 成员调用。纯浏览器入口不会加载
Vite/compiler/Yuku。模板 Hook 绑定使用 `<script setup>`；普通 `<script>` 自身仍提取，但
不会静态追踪 Options API `setup()` 返回对象到模板。

Vue JSX/TSX 使用默认的框架中立 JSX 分析入口，并由 `@ai-i18n/vue` Hook binding 识别。
与 React JSX 共存时，文件不需要框架后缀；只需用 `@vitejs/plugin-vue-jsx` 的任意
`include` glob 声明 Vue 文件范围，其余 JSX 可以交给 React 默认处理。
