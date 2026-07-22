<script setup lang="ts">
import { useI18n } from '@ai-i18n/vue'

const { t, setLang, currentLang, langs } = useI18n()
</script>

<template>
  <main id="center">
    <h1>{{ t('Vue 示例') }}</h1>
    <p>{{ t('Composition API 与 Vite extractor 共享 Runtime') }}</p>
    <label>
      {{ t('语言') }}
      <select :value="currentLang" @change="setLang(($event.target as HTMLSelectElement).value)">
        <option v-for="lang in langs" :key="lang.value" :value="lang.value">
          {{ lang.label }}
        </option>
      </select>
    </label>
  </main>
</template>
