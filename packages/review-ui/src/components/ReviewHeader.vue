<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewCopy } from '@ai-i18n/core/review-i18n';

const props = defineProps<{
  confirmedCount: number;
  copy: ReviewCopy;
  total: number;
  visibleCount: number;
}>();

const progress = computed(() =>
  props.total ? Math.round((props.confirmedCount / props.total) * 100) : 0,
);
const remaining = computed(() =>
  Math.max(0, props.total - props.confirmedCount),
);
const progressSummary = computed(() =>
  props.copy.progressSummary({
    remaining: remaining.value,
    total: props.total,
    visible: props.visibleCount,
  }),
);
</script>

<template>
  <header
    class="flex flex-none items-center gap-3 border-b border-line bg-bgOverlay px-3 py-2.5"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <span class="text-[11px] font-bold tracking-wide text-muted uppercase">
          {{ copy.progressLabel }}
        </span>
        <span class="text-[11px] font-mono text-dimmed whitespace-nowrap">
          {{ confirmedCount }}/{{ total }}
        </span>
      </div>
      <div
        class="h-1 overflow-hidden rounded-full bg-bgWash"
        role="progressbar"
        :aria-valuenow="progress"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="copy.progressLabel"
      >
        <div class="review-progress-fill" :style="{ width: `${progress}%` }" />
      </div>
      <p class="m-0 mt-1.5 text-[11px] text-muted leading-snug">
        {{ progressSummary }}
      </p>
    </div>
  </header>
</template>
