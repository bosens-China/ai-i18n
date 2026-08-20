<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import { reviewBaseline } from '../review-state';

const props = defineProps<{
  copy: ReviewCopy;
  locale: string;
  message: ReviewMessage;
  selected: boolean;
}>();

const preview = computed(() => reviewBaseline(props.message, props.locale, {}));
const reviewed = computed(() =>
  props.message.overrides.some((item) => item.locale === props.locale),
);
const firstOccurrence = computed(() => props.message.occurrences[0]);
const extraFiles = computed(() =>
  Math.max(0, props.message.occurrences.length - 1),
);

function fileLabel(): string {
  const occurrence = firstOccurrence.value;
  if (!occurrence) return '';
  const line = occurrence.locations[0]?.line;
  return `${occurrence.sourceFile}${line ? `:${line}` : ''}`;
}
</script>

<template>
  <button
    class="workbench-list-item appearance-none w-full h-[84px] p-3 text-left border-0 border-b border-line bg-transparent transition-colors hover:bg-bgWashHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    :class="{
      'bg-bgOverlay shadow-[inset_3px_0_0_#3b82f6]': selected,
      reviewed,
    }"
    role="option"
    type="button"
    :aria-selected="selected"
  >
    <span class="flex items-center gap-2 truncate">
      <span class="min-w-0 flex-1 font-bold text-xs text-ink truncate">{{
        message.message.source
      }}</span>
      <span
        class="shrink-0"
        :class="reviewed ? 'badge-reviewed' : 'badge-unreviewed'"
        >{{ reviewed ? copy.reviewed : copy.unreviewed }}</span
      >
    </span>
    <span class="block mt-1 text-xs text-muted truncate">{{ preview }}</span>
    <span
      v-if="firstOccurrence"
      class="block mt-1 text-[11px] font-mono text-dimmed truncate"
      :title="fileLabel()"
    >
      {{ fileLabel() }}
      <span v-if="extraFiles"> · +{{ extraFiles }}</span>
    </span>
  </button>
</template>
