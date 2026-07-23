<script setup lang="ts">
import { useI18n } from '@ai-i18n/vue';
import { computed } from 'vue';

const { t, currentLang, langs } = useI18n();
const currentLanguageLabel = computed(
  () =>
    langs.value.find(({ value }) => value === currentLang.value)?.label ??
    currentLang.value,
);
</script>

<template>
  <section class="demo-step">
    <span class="step-number">01 · Vue SFC</span>
    <h2>{{ t('当前语言') }}</h2>
    <div class="locale-readout" aria-live="polite">
      <span class="status-dot" aria-hidden="true"></span>
      <strong>{{ currentLanguageLabel }}</strong>
      <code>{{ currentLang }}</code>
    </div>
  </section>
</template>
