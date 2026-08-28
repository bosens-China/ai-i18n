<script setup lang="ts">
import type { ReviewLocale } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';

defineProps<{
  copy: ReviewCopy;
  horizontal?: boolean;
  locale: string;
  locales: readonly ReviewLocale[];
}>();

const emit = defineEmits<{ updateLocale: [locale: string] }>();

function localeCode(locale: string): string {
  return (locale.split(/[-_]/u)[0] || locale).slice(0, 3).toUpperCase();
}
</script>

<template>
  <nav
    class="review-locale-rail flex min-h-0 flex-none items-center gap-1.5"
    :class="
      horizontal
        ? 'w-auto flex-row overflow-x-auto border-r-0 bg-transparent p-0'
        : 'w-[58px] flex-col overflow-y-auto border-r border-line bg-bgOverlay px-2 py-2.25'
    "
    :aria-label="copy.localesLabel"
  >
    <span
      class="grid h-5.5 w-6.5 flex-none place-items-center text-dimmed"
      aria-hidden="true"
    >
      <svg
        class="h-4 w-4 stroke-[1.7]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="12" cy="12" r="8.5" />
        <path
          d="M3.8 12h16.4M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5C9.8 18.2 8.7 15.4 8.7 12S9.8 5.8 12 3.5Z"
        />
      </svg>
    </span>
    <button
      v-for="item in locales"
      :key="item.value"
      class="review-locale-option locale-option"
      type="button"
      :aria-label="item.label || item.value"
      :aria-pressed="item.value === locale"
      :title="item.label || item.value"
      @click="emit('updateLocale', item.value)"
    >
      {{ localeCode(item.value) }}
    </button>
  </nav>
</template>
