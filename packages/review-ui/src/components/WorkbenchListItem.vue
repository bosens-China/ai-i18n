<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '@ai-i18n/core/review-i18n';
import { currentReviewOccurrence, reviewBaseline } from '../review-state';

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
const occurrence = computed(() => currentReviewOccurrence(props.message, {}));
const emit = defineEmits<{ select: [] }>();

const locationLabel = computed(() => {
  const target = occurrence.value;
  return target
    ? `${target.file}:${target.location.line}:${target.location.column + 1}`
    : '';
});

const editorHref = computed(() => {
  const target = occurrence.value;
  if (!target) return '';
  const query = new URLSearchParams({
    file: target.file,
    line: String(target.location.line),
    column: String(target.location.column),
  });
  return `/__ai-i18n/api/editor?${query}`;
});
</script>

<template>
  <article
    class="workbench-list-item h-[92px] w-full overflow-hidden border-b border-line bg-transparent"
    :class="{
      selected,
      reviewed,
    }"
    role="listitem"
  >
    <button
      class="workbench-list-select block w-full cursor-pointer overflow-hidden border-0 bg-transparent px-2.5 pt-2 pb-0.75 text-left text-inherit"
      type="button"
      :aria-pressed="selected"
      @click="emit('select')"
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
    </button>

    <footer
      v-if="occurrence"
      class="flex min-w-0 items-center gap-2 px-2 pt-0.25 pb-1.75 pl-2.5"
    >
      <span
        class="workbench-list-location flex h-5.25 min-w-0 flex-1 items-center gap-1.25 overflow-hidden rounded-[5px] px-1.5 font-mono text-[10px] leading-[1.25] font-semibold"
        :title="locationLabel"
      >
        <svg
          class="h-2.75 w-2.75 flex-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="M7 3.5h7l3 3V20H7z" />
          <path d="M14 3.5V7h3M9.5 11.5h5M9.5 15h5" />
        </svg>
        <span class="min-w-0 truncate">{{ locationLabel }}</span>
      </span>
      <a
        class="workbench-list-vscode grid h-5.5 w-5.5 flex-none place-items-center rounded-[5px] border no-underline transition-colors duration-160"
        :href="editorHref"
        target="_blank"
        rel="noreferrer"
        :aria-label="copy.openInVsCodeLabel(locationLabel)"
        :title="copy.openInVsCode"
      >
        <svg
          class="h-3.5 w-3.5 fill-current"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="m17.5 3-8.8 7.3-4-3.1L2.5 9l3.9 3-3.9 3 2.2 1.8 4-3.1 8.8 7.3 4-1.9V4.9L17.5 3Zm0 5.2v7.6L12.8 12l4.7-3.8Z"
          />
        </svg>
      </a>
    </footer>
  </article>
</template>
