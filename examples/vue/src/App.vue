<script setup lang="ts">
import { computed } from 'vue';

const { t, setLang, currentLang, langs } = useI18n();
const currentLanguageLabel = computed(
  () =>
    langs.value.find(({ value }) => value === currentLang.value)?.label ??
    currentLang.value,
);
</script>

<template>
  <main class="demo-app">
    <header class="demo-header">
      <p class="demo-eyebrow">useI18n · Vue 3</p>
      <h1>{{ t('Vue 示例') }}</h1>
    </header>

    <section class="demo-panel" :aria-label="t('交互式语言切换演示')">
      <article class="demo-card">
        <span class="demo-label">{{ t('当前语言') }}</span>
        <div class="locale-readout" aria-live="polite">
          <span class="status-dot" aria-hidden="true"></span>
          <strong>{{ currentLanguageLabel }}</strong>
          <code>{{ currentLang }}</code>
        </div>
      </article>

      <article class="demo-card">
        <span class="demo-label">{{ t('切换语言') }}</span>
        <label class="language-control">
          <span class="sr-only">{{ t('语言') }}</span>
          <select
            :value="currentLang"
            @change="setLang(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="lang in langs" :key="lang.value" :value="lang.value">
              {{ lang.label }}
            </option>
          </select>
        </label>
      </article>

      <article class="demo-card demo-card--highlight">
        <span class="demo-label">{{ t('文案变化') }}</span>
        <div class="translation-output" aria-live="polite">
          <p>{{ t('响应式文案会随语言立即更新') }}</p>
          <span>{{ t('模板会自动响应 Runtime 状态。') }}</span>
        </div>
      </article>
    </section>
  </main>
</template>
