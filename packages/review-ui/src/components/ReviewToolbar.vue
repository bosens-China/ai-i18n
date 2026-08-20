<script setup lang="ts">
import type { ReviewLocale } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import type { ReviewWorkbenchFilter } from '../review-state';

defineProps<{
  compact: boolean;
  copy: ReviewCopy;
  locales: readonly ReviewLocale[];
}>();

const locale = defineModel<string>('locale', { required: true });
const filter = defineModel<ReviewWorkbenchFilter>('filter', { required: true });
const query = defineModel<string>('query', { required: true });
</script>

<template>
  <section
    class="flex-none grid border-b border-line bg-bgOverlay backdrop-blur-md sticky top-0 z-10"
    :class="compact ? 'gap-1.5 p-2' : 'gap-2.5 p-3.5'"
    :aria-label="copy.filtersLabel"
  >
    <label class="relative block">
      <svg
        class="absolute top-1/2 left-3 w-4 h-4 text-accent -translate-y-1/2 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span class="sr-only">{{ copy.search }}</span>
      <input
        v-model="query"
        class="review-input w-full pl-9 pr-3.5 rounded-md border border-line bg-bgWash text-ink text-xs"
        :class="compact ? 'h-8' : 'h-9'"
        type="search"
        :aria-label="copy.search"
        :placeholder="copy.search"
      />
    </label>

    <div class="grid grid-cols-1 gap-2">
      <div
        class="flex gap-1 overflow-x-auto p-1 rounded-lg border border-line bg-bgWash scrollbar-none"
        :aria-label="copy.localesLabel"
      >
        <button
          v-for="item in locales"
          :key="item.value"
          class="filter-segment"
          type="button"
          :aria-pressed="item.value === locale"
          @click="locale = item.value"
        >
          {{ item.label || item.value }}
        </button>
      </div>

      <div
        class="flex gap-1 overflow-x-auto p-1 rounded-lg border border-line bg-bgWash scrollbar-none"
        :aria-label="copy.statusLabel"
      >
        <button
          v-for="item in [
            { value: 'all' as const, label: copy.all },
            { value: 'unreviewed' as const, label: copy.unreviewed },
            { value: 'reviewed' as const, label: copy.reviewed },
            { value: 'token-error' as const, label: copy.tokenError },
          ]"
          :key="item.value"
          class="filter-segment"
          type="button"
          :aria-pressed="item.value === filter"
          @click="filter = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
  </section>
</template>
