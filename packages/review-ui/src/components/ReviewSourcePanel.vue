<script setup lang="ts">
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';

defineProps<{
  copy: ReviewCopy;
  message: ReviewMessage;
}>();

function fileLabel(sourceFile: string, line?: number): string {
  return `${sourceFile}${line ? `:${line}` : ''}`;
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
</script>

<template>
  <section class="flex-none p-5 border-b border-line bg-bgWash">
    <p
      class="m-0 text-accent font-mono text-[11px] font-bold tracking-wider uppercase"
    >
      {{ copy.source }}
    </p>
    <p
      class="my-2 text-slate-100 text-base font-semibold leading-normal whitespace-pre-wrap break-words"
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
    <ul class="m-0 p-0 list-none grid gap-1.5">
      <li
        v-for="item in message.occurrences"
        :key="item.sourceFile"
        class="flex items-center gap-2"
      >
        <span class="min-w-0 font-mono text-xs text-muted truncate">
          {{ fileLabel(item.sourceFile, item.locations[0]?.line) }}
        </span>
        <a
          v-if="item.locations[0]"
          class="shrink-0 text-xs font-bold text-accent hover:text-cyan hover:underline transition-colors no-underline"
          :href="editorHref(item.sourceFile, item.locations[0])"
          target="_blank"
          rel="noreferrer"
          :aria-label="`${copy.openInVsCode}：${fileLabel(item.sourceFile, item.locations[0].line)}`"
        >
          {{ copy.openInVsCode }}
        </a>
      </li>
    </ul>
  </section>
</template>
