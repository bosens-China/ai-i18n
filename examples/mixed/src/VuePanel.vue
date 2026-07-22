<script setup lang="ts">
import { useI18n } from '@ai-i18n/vue'

const { t, setLang, currentLang } = useI18n()
</script>

<template>
  <section>
    <h2>{{ t('Vue 面板') }}</h2>
    <p>{{ t('当前语言') }}：{{ currentLang }}</p>
    <button type="button" @click="setLang('en-US')">
      {{ t('切换到英文') }}
    </button>
  </section>
</template>
