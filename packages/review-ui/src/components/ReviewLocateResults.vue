<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import { messageKey, type ReviewOccurrenceTarget } from '../review-state';

const props = defineProps<{
  candidateKeys: ReadonlySet<string>;
  copy: ReviewCopy;
  messages: readonly ReviewMessage[];
}>();

const emit = defineEmits<{
  back: [];
  select: [message: ReviewMessage, target: ReviewOccurrenceTarget];
}>();

interface LocateEntry {
  message: ReviewMessage;
  target: ReviewOccurrenceTarget;
}

const groups = computed(() => {
  const grouped = new Map<string, LocateEntry[]>();
  for (const message of props.messages) {
    if (!props.candidateKeys.has(messageKey(message.message))) continue;
    for (const occurrence of message.occurrences) {
      const entries = grouped.get(occurrence.sourceFile) ?? [];
      for (const location of occurrence.locations) {
        entries.push({
          message,
          target: {
            file: occurrence.sourceFile,
            location: { ...location },
          },
        });
      }
      grouped.set(occurrence.sourceFile, entries);
    }
  }
  return [...grouped.entries()].map(([file, entries]) => ({ file, entries }));
});
</script>

<template>
  <section class="locate-results flex-1 min-h-0 flex flex-col bg-bgSurface">
    <header class="locate-header flex-none px-3 py-2.5 border-b border-cyan/25">
      <button
        class="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[11px] leading-[1.2] font-bold text-accent hover:text-cyan"
        type="button"
        @click="emit('back')"
      >
        <span aria-hidden="true">←</span>
        {{ copy.backToBrowse }}
      </button>
      <div class="mt-2 flex items-center justify-between gap-2">
        <strong class="text-xs text-cyan">{{ copy.locateResults }}</strong>
        <span class="font-mono text-[10px] text-dimmed">
          {{ candidateKeys.size }} {{ copy.candidates }}
        </span>
      </div>
      <p class="m-0 mt-1 text-[11px] leading-relaxed text-muted">
        {{ copy.locateHint }}
      </p>
    </header>

    <div v-if="groups.length" class="flex-1 min-h-0 overflow-y-auto py-1.5">
      <section v-for="group in groups" :key="group.file" class="file-group">
        <div
          class="flex items-center gap-1.5 bg-bgWash px-3 py-1.5 font-mono text-[10px] leading-[1.3] font-semibold text-dimmed"
          :title="group.file"
        >
          <span aria-hidden="true">▾</span>
          <span class="truncate">{{ group.file }}</span>
        </div>
        <button
          v-for="entry in group.entries"
          :key="`${messageKey(entry.message.message)}:${entry.target.location.line}:${entry.target.location.column}`"
          class="locate-entry relative grid w-full cursor-pointer grid-cols-[14px_minmax(0,1fr)] border-0 border-b border-line bg-transparent py-2.25 pr-3 pl-2.5 text-left text-inherit hover:bg-bgWashHover focus-visible:bg-bgWashHover focus-visible:outline-none"
          type="button"
          @click="emit('select', entry.message, entry.target)"
        >
          <span
            class="location-rail relative h-full w-2"
            aria-hidden="true"
          ></span>
          <span class="min-w-0">
            <span class="block text-xs font-bold text-ink truncate">
              {{ entry.message.message.source }}
            </span>
            <span class="block mt-1 font-mono text-[10px] text-cyan">
              L{{ entry.target.location.line }}:C{{
                entry.target.location.column + 1
              }}
            </span>
          </span>
        </button>
      </section>
    </div>
    <div v-else class="m-auto p-8 text-center text-xs text-muted">
      {{ copy.pickerNoMatch }}
    </div>
  </section>
</template>
