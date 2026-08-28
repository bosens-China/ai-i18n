<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewCopy } from '../copy';
import type { ReviewWorkbenchTab } from './ReviewWorkbenchTabs.vue';

const props = defineProps<{
  confirmedCount: number;
  copy: ReviewCopy;
  total: number;
  visibleCount: number;
}>();

const tab = defineModel<ReviewWorkbenchTab>({ required: true });
const progress = computed(() =>
  props.total ? Math.round((props.confirmedCount / props.total) * 100) : 0,
);
const remaining = computed(() =>
  Math.max(0, props.total - props.confirmedCount),
);
</script>

<template>
  <header class="review-standalone-header flex flex-none items-center gap-6">
    <div class="flex min-w-0 flex-1 items-center gap-3.5">
      <span
        class="review-standalone-mark grid h-10 w-10 flex-none place-items-center rounded-xl"
        aria-hidden="true"
      >
        <svg class="h-6 w-6" viewBox="0 0 40 40" fill="none">
          <path
            d="M8.5 7.5h19A5.5 5.5 0 0 1 33 13v9.5a5.5 5.5 0 0 1-5.5 5.5H18l-7 5v-5H8.5A4.5 4.5 0 0 1 4 23.5V12a4.5 4.5 0 0 1 4.5-4.5Z"
            fill="currentColor"
          />
          <path
            d="M11.5 14.5h13M11.5 19h8"
            stroke="white"
            stroke-width="2.25"
            stroke-linecap="round"
          />
          <circle cx="29" cy="27.5" r="6.25" fill="var(--review-bg-surface)" />
          <path
            d="m26.2 27.5 1.8 1.8 3.8-4.2"
            stroke="var(--review-cyan)"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <div class="min-w-0">
        <p
          class="m-0 font-mono text-[10px] font-bold tracking-[0.14em] text-cyan uppercase"
        >
          {{ copy.standaloneEyebrow }}
        </p>
        <div class="mt-0.5 flex min-w-0 items-baseline gap-3">
          <h1 class="m-0 truncate text-base font-bold text-ink">
            {{ copy.reviewTitle }}
          </h1>
          <p class="m-0 hidden truncate text-xs text-muted lg:block">
            {{ copy.standaloneSubtitle }}
          </p>
        </div>
      </div>
    </div>

    <section
      class="review-standalone-progress hidden min-w-[240px] items-center gap-3 md:flex"
      :aria-label="copy.progressLabel"
    >
      <div class="min-w-0 flex-1">
        <div class="mb-1.5 flex items-center justify-between gap-3">
          <span
            class="text-[10px] font-bold tracking-wide text-muted uppercase"
          >
            {{ copy.progressLabel }}
          </span>
          <span class="font-mono text-[10px] text-dimmed">
            {{ confirmedCount }}/{{ total }}
          </span>
        </div>
        <div
          class="h-1 overflow-hidden rounded-full bg-bgWash"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="review-progress-fill"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>
      <div class="min-w-[54px] text-right">
        <strong class="block font-mono text-sm leading-none text-ink">
          {{ visibleCount }}
        </strong>
        <span class="mt-1 block text-[10px] text-dimmed">
          {{ remaining }} {{ copy.remainingShort }}
        </span>
      </div>
    </section>

    <nav
      class="flex flex-none items-center gap-1 rounded-lg border border-line bg-bgWash p-1"
      :aria-label="copy.workbenchTabsLabel"
    >
      <button
        class="standalone-nav-option"
        type="button"
        :aria-pressed="tab === 'all'"
        @click="tab = 'all'"
      >
        {{ copy.reviewQueue }}
      </button>
      <button
        class="standalone-nav-option"
        type="button"
        :aria-pressed="tab === 'settings'"
        @click="tab = 'settings'"
      >
        {{ copy.tabSettings }}
      </button>
    </nav>
  </header>
</template>
