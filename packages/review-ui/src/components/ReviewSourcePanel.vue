<script setup lang="ts">
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import {
  reviewOccurrenceTargets,
  type ReviewOccurrenceTarget,
} from '../review-state';

const props = defineProps<{
  compact: boolean;
  copy: ReviewCopy;
  message: ReviewMessage;
  selected?: ReviewOccurrenceTarget;
}>();

const emit = defineEmits<{
  selectOccurrence: [scope: ReviewOccurrenceTarget];
}>();

function fileLabel(target: ReviewOccurrenceTarget): string {
  return `${target.file}:${target.location.line}:${target.location.column + 1}`;
}

function editorHref(
  sourceFile: string,
  location: { line: number; column: number },
): string {
  const query = new URLSearchParams({
    file: sourceFile,
    line: String(location.line),
    column: String(location.column),
  });
  return `/__ai-i18n/api/editor?${query}`;
}

function isSelected(target: ReviewOccurrenceTarget): boolean {
  return (
    props.selected?.file === target.file &&
    props.selected.location.line === target.location.line &&
    props.selected.location.column === target.location.column
  );
}
</script>

<template>
  <section
    class="flex-none border-b border-line bg-bgWash"
    :class="compact ? 'p-3' : 'p-5'"
  >
    <p
      class="m-0 text-accent font-mono text-[11px] font-bold tracking-wider uppercase"
    >
      {{ copy.source }}
    </p>
    <p
      class="text-slate-100 font-semibold leading-normal whitespace-pre-wrap break-words"
      :class="compact ? 'my-1 text-sm' : 'my-2 text-base'"
    >
      {{ message.message.source }}
    </p>
    <p
      v-if="message.message.comment"
      class="mb-3.5 p-2 rounded-r-md border-l-2 border-cyan bg-cyan/10 text-muted text-xs leading-relaxed"
    >
      <span
        class="text-cyan font-mono text-[11px] font-bold tracking-wider uppercase"
        >{{ copy.context }}</span
      >
      <br />
      {{ message.message.comment }}
    </p>
    <ul
      class="m-0 p-0 list-none gap-1.5"
      :class="compact ? 'flex flex-wrap' : 'grid'"
    >
      <li
        v-for="item in reviewOccurrenceTargets(message)"
        :key="`${item.file}:${item.location.line}:${item.location.column}`"
        class="flex items-center gap-2"
      >
        <button
          class="min-w-0 p-0 border-0 bg-transparent font-mono text-xs text-left truncate transition-colors hover:text-ink"
          :class="isSelected(item) ? 'text-accent font-bold' : 'text-muted'"
          type="button"
          :aria-pressed="isSelected(item)"
          @click="emit('selectOccurrence', item)"
        >
          {{ fileLabel(item) }}
        </button>
        <a
          class="shrink-0 text-xs font-bold text-accent hover:text-cyan hover:underline transition-colors no-underline"
          :href="editorHref(item.file, item.location)"
          target="_blank"
          rel="noreferrer"
          :aria-label="`${copy.openInVsCode}：${fileLabel(item)}`"
        >
          {{ copy.openInVsCode }}
        </a>
      </li>
    </ul>
  </section>
</template>
