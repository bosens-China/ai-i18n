<script setup lang="ts">
import type { ReviewLocale } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import type { ReviewWorkbenchFilter } from '../review-state';
import ReviewLocaleRail from './ReviewLocaleRail.vue';

defineProps<{
  copy: ReviewCopy;
  fileSuffixes: readonly string[];
  locale: string;
  locales: readonly ReviewLocale[];
  vertical: boolean;
}>();

const filter = defineModel<ReviewWorkbenchFilter>('filter', { required: true });
const fileSuffix = defineModel<string>('fileSuffix', { required: true });
const query = defineModel<string>('query', { required: true });
const emit = defineEmits<{ updateLocale: [locale: string] }>();
</script>

<template>
  <section
    class="review-filter-rail flex min-w-0 min-h-0 flex-none border-r border-line bg-bgOverlay"
    :class="{ 'border-b border-r-0': !vertical }"
    :aria-label="copy.filtersLabel"
  >
    <ReviewLocaleRail
      v-if="locales.length > 1"
      :copy="copy"
      :locale="locale"
      :locales="locales"
      @update-locale="emit('updateLocale', $event)"
    />

    <div
      class="review-filter-body flex-1 min-w-0"
      :class="
        vertical ? 'flex flex-col gap-3 min-h-0 overflow-y-auto p-3' : 'p-2'
      "
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
          class="review-input w-full pl-9 pr-3.5 rounded-md border border-line bg-bgWash text-ink text-xs h-8"
          type="search"
          :aria-label="copy.search"
          :placeholder="copy.search"
        />
      </label>

      <div
        class="review-filter-groups flex min-h-0 flex-col"
        :class="vertical ? 'gap-2.5' : 'mt-2 gap-2'"
      >
        <section class="review-filter-control min-w-0">
          <p
            class="m-0 mb-1.5 block text-[10px] leading-[1.2] font-bold tracking-[0.08em] text-dimmed uppercase"
          >
            {{ copy.statusLabel }}
          </p>
          <div
            class="review-filter-options flex min-w-0 flex-nowrap gap-1 overflow-x-auto rounded-lg border border-line bg-bgWash p-1 scrollbar-none"
            :class="vertical ? 'flex-col items-stretch overflow-visible' : ''"
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
              :class="{ 'w-full justify-start': vertical }"
              type="button"
              :aria-pressed="item.value === filter"
              @click="filter = item.value"
            >
              {{ item.label }}
            </button>
          </div>
        </section>

        <section
          v-if="fileSuffixes.length"
          class="review-filter-control min-w-0"
        >
          <p
            class="m-0 mb-1.5 block text-[10px] leading-[1.2] font-bold tracking-[0.08em] text-dimmed uppercase"
          >
            {{ copy.suffixLabel }}
          </p>
          <div
            class="review-filter-options flex min-w-0 flex-nowrap gap-1 overflow-x-auto rounded-lg border border-line bg-bgWash p-1 scrollbar-none"
            :class="vertical ? 'flex-col items-stretch overflow-visible' : ''"
            :aria-label="copy.suffixLabel"
          >
            <button
              v-for="suffix in ['', ...fileSuffixes]"
              :key="suffix || 'all'"
              class="filter-segment"
              :class="{ 'w-full justify-start': vertical }"
              type="button"
              :aria-pressed="suffix === fileSuffix"
              @click="fileSuffix = suffix"
            >
              {{ suffix || copy.all }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>
