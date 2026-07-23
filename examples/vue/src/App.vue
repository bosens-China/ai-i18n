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
  <main class="page-shell">
    <header class="hero">
      <p class="eyebrow">@ai-i18n/vite · Vue reactive runtime</p>
      <h1>{{ t('Vue 示例') }}</h1>
      <p class="lede">
        {{ t('Composition API 与 Vite extractor 共享 Runtime') }}
      </p>
    </header>

    <section class="demo-grid" :aria-label="t('交互式语言切换演示')">
      <article class="demo-step">
        <span class="step-number">01</span>
        <h2>{{ t('当前语言') }}</h2>
        <div class="locale-readout" aria-live="polite">
          <span class="status-dot" aria-hidden="true"></span>
          <strong>{{ currentLanguageLabel }}</strong>
          <code>{{ currentLang }}</code>
        </div>
      </article>

      <article class="demo-step">
        <span class="step-number">02</span>
        <h2>{{ t('切换语言') }}</h2>
        <label class="language-control">
          <span>{{ t('语言') }}</span>
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

      <article class="demo-step result-step">
        <span class="step-number">03</span>
        <h2>{{ t('文案变化') }}</h2>
        <div class="translation-output" aria-live="polite">
          <p>{{ t('响应式文案会随语言立即更新') }}</p>
          <span>{{ t('模板会自动响应 Runtime 状态。') }}</span>
        </div>
      </article>
    </section>
  </main>
</template>
