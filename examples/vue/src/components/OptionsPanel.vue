<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'OptionsPanel',

  data() {
    return {
      languageChangeCount: 0,
      previousLanguage: '—',
      nextLanguage: '—',
    };
  },

  computed: {
    ...i18nComputed(),

    translatedMessage: tComputed('响应式文案会随语言立即更新'),

    currentLanguageLabel(): string {
      return (
        this.langs.find(({ value }) => value === this.currentLang)?.label ??
        this.currentLang
      );
    },

    languageTransition(): string {
      if (this.languageChangeCount === 0) return t('尚未发生语言变化');
      return `${this.previousLanguage} → ${this.nextLanguage}`;
    },

    loadErrorLabel(): string {
      return this.langLoadState.status === 'error'
        ? `${t('已捕获')}: ${String(this.langLoadError)}`
        : 'null';
    },
  },

  watch: {
    currentLang(next: string, previous: string) {
      this.languageChangeCount += 1;
      this.previousLanguage = previous;
      this.nextLanguage = next;
    },
  },

  methods: {
    async switchLanguage(event: Event): Promise<void> {
      const target = event.currentTarget;
      if (!(target instanceof HTMLSelectElement)) return;

      try {
        await setLang(target.value);
      } catch {
        // 错误状态和载荷已经写入响应式状态，由模板负责呈现。
      }
    },
  },
});
</script>

<template>
  <article class="api-panel api-panel--options" data-testid="options-panel">
    <header class="panel-header">
      <div>
        <p class="panel-kicker">{{ t('完整兼容') }}</p>
        <h2>Options API</h2>
      </div>
      <code class="api-signature">defineComponent()</code>
    </header>

    <p class="panel-description">
      i18nComputed() + tComputed() · {{ t('无需 setup，也无需 .value。') }}
    </p>

    <label class="language-control">
      <span>{{ t('在 Options API 中切换语言') }}</span>
      <select
        data-testid="options-language-select"
        :disabled="isLangLoading"
        :value="currentLang"
        @change="switchLanguage"
      >
        <option v-for="lang in langs" :key="lang.value" :value="lang.value">
          {{ lang.label }}
        </option>
      </select>
    </label>

    <dl class="runtime-readout">
      <div>
        <dt>{{ t('当前语言') }}</dt>
        <dd>
          <strong>{{ currentLanguageLabel }}</strong>
          <code data-testid="options-current-lang">{{ currentLang }}</code>
        </dd>
      </div>
      <div>
        <dt><code>langLoadState</code></dt>
        <dd>
          <span
            class="state-indicator"
            data-testid="options-load-status"
            :data-state="langLoadState.status"
          >
            {{ langLoadState.status }}
          </span>
        </dd>
      </div>
      <div>
        <dt><code>isLangLoading</code></dt>
        <dd data-testid="options-loading">{{ String(isLangLoading) }}</dd>
      </div>
      <div>
        <dt><code>langLoadError</code></dt>
        <dd data-testid="options-error-binding">{{ loadErrorLabel }}</dd>
      </div>
    </dl>

    <section class="translation-card">
      <span class="translation-card__label">
        {{ t('tComputed 响应式文案') }}
      </span>
      <p data-testid="options-translated-message">
        {{ translatedMessage }}
      </p>
      <small data-testid="options-template-message">
        {{ t('模板中的 t 会同步更新。') }}
      </small>
    </section>

    <section class="watch-readout">
      <div>
        <span>{{ t('Options 原生监听') }}</span>
        <code>watch.currentLang</code>
      </div>
      <strong data-testid="options-watch-count">
        {{ languageChangeCount }}
      </strong>
      <output data-testid="options-watch-transition">
        {{ languageTransition }}
      </output>
    </section>

    <p
      v-if="langLoadState.status === 'error'"
      class="error-message"
      data-testid="options-error"
      role="alert"
    >
      {{ t('语言包加载失败，当前语言保持不变。') }}
    </p>
  </article>
</template>
