<script setup lang="ts">
import type { ReviewUiThemePreference } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';

defineProps<{
  copy: ReviewCopy;
  preference: ReviewUiThemePreference;
}>();

const emit = defineEmits<{
  updatePreference: [preference: ReviewUiThemePreference];
}>();

const themeOptions = [
  { value: 'light' as const, labelKey: 'themeLight' as const },
  { value: 'dark' as const, labelKey: 'themeDark' as const },
  { value: 'system' as const, labelKey: 'themeSystem' as const },
] as const;
</script>

<template>
  <section class="review-settings-panel flex-1 min-h-0 overflow-y-auto p-5">
    <h2 class="m-0 text-sm font-bold text-ink">{{ copy.settingsLabel }}</h2>
    <p class="mt-1 mb-5 text-xs text-muted leading-relaxed">
      {{ copy.settingsHint }}
    </p>

    <section class="max-w-md" :aria-label="copy.appearance">
      <h3
        class="m-0 mb-3 text-[11px] font-bold tracking-wider uppercase text-dimmed"
      >
        {{ copy.appearance }}
      </h3>
      <div
        class="grid grid-cols-3 gap-1.5 p-1.5 rounded-lg border border-line bg-bgWash max-w-sm"
        role="radiogroup"
        :aria-label="copy.appearance"
      >
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-segment segment-option h-9 px-2 text-center"
          type="button"
          role="radio"
          :aria-pressed="preference === option.value"
          :aria-checked="preference === option.value"
          @click="emit('updatePreference', option.value)"
        >
          {{ copy[option.labelKey] }}
        </button>
      </div>
    </section>
  </section>
</template>
