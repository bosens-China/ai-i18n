<script setup lang="ts">
import { computed } from 'vue';

const {
  setLang,
  currentLang,
  langs,
  langLoadState,
  isLangLoading,
  langLoadError,
} = useI18n();
const translatedMessage = tRef('响应式文案会随语言立即更新');
// 文案树只创建一次，模板按当前语言选择已翻译结果。
const translatedAnalysisProof = tRef({
  status: '共享 Runtime',
  steps: ['自动发现 tsconfig', '递归解析项目引用'],
});
const proofStepIndex = computed(() => (currentLang.value === 'zh-CN' ? 0 : 1));
const currentLanguageLabel = computed(
  () =>
    langs.value.find(({ value }) => value === currentLang.value)?.label ??
    currentLang.value,
);
const loadErrorLabel = computed(() =>
  langLoadState.value.status === 'error'
    ? `${t('已捕获')}: ${String(langLoadError.value)}`
    : 'null',
);

async function switchLanguage(event: Event): Promise<void> {
  const target = event.currentTarget;
  if (!(target instanceof HTMLSelectElement)) return;

  try {
    await setLang(target.value);
  } catch {
    // 错误状态和载荷已经写入响应式状态，由模板负责呈现。
  }
}
</script>

<template>
  <article class="api-panel" data-testid="composition-panel">
    <header class="panel-header">
      <div>
        <p class="panel-kicker">{{ t('推荐写法') }}</p>
        <h2>Composition API</h2>
      </div>
      <code class="api-signature">&lt;script setup lang="ts"&gt;</code>
    </header>

    <p class="panel-description">autoImport t() + useI18n() + tRef()</p>

    <label class="language-control">
      <span>{{ t('在 Composition API 中切换语言') }}</span>
      <select
        data-testid="composition-language-select"
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
          <code data-testid="composition-current-lang">{{ currentLang }}</code>
        </dd>
      </div>
      <div>
        <dt><code>langLoadState</code></dt>
        <dd>
          <span
            class="state-indicator"
            data-testid="composition-load-status"
            :data-state="langLoadState.status"
          >
            {{ langLoadState.status }}
          </span>
        </dd>
      </div>
      <div>
        <dt><code>isLangLoading</code></dt>
        <dd data-testid="composition-loading">{{ String(isLangLoading) }}</dd>
      </div>
      <div>
        <dt><code>langLoadError</code></dt>
        <dd data-testid="composition-error-binding">{{ loadErrorLabel }}</dd>
      </div>
    </dl>

    <section class="translation-card">
      <span class="translation-card__label">
        {{ t('tRef 响应式文案') }}
      </span>
      <p data-testid="composition-translated-message">
        {{ translatedMessage }}
      </p>
      <small>{{ t('模板会自动响应 Runtime 状态。') }}</small>
    </section>

    <footer class="analysis-proof">
      <span>{{ translatedAnalysisProof.status }}</span>
      <code>{{ translatedAnalysisProof.steps[proofStepIndex] }}</code>
    </footer>

    <p
      v-if="langLoadState.status === 'error'"
      class="error-message"
      data-testid="composition-error"
      role="alert"
    >
      {{ t('语言包加载失败，当前语言保持不变。') }}
    </p>
  </article>
</template>
