<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import type { ReviewOccurrenceTarget, ReviewScope } from '../review-state';

const props = defineProps<{
  copy: ReviewCopy;
  message: ReviewMessage;
  scope: ReviewScope;
  currentOccurrence?: ReviewOccurrenceTarget;
}>();

const emit = defineEmits<{ updateScope: [scope: ReviewScope] }>();
const currentFile = computed(() => props.currentOccurrence?.file ?? '');
const isOccurrence = computed(() => Boolean(props.scope.location));
</script>

<template>
  <section
    class="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-3.5 items-center"
    :aria-label="copy.scope"
  >
    <p class="m-0 text-accent text-[11px] font-semibold tracking-[0.02em]">
      {{ copy.scope }}
    </p>
    <div
      class="inline-flex w-fit max-w-full gap-1 overflow-x-auto p-1 rounded-lg border border-line bg-bgWash scrollbar-none"
      role="group"
      :aria-label="copy.scope"
    >
      <button
        v-if="currentOccurrence"
        class="scope-segment"
        type="button"
        :aria-pressed="isOccurrence"
        :title="`${currentOccurrence.file}:${currentOccurrence.location.line}:${currentOccurrence.location.column + 1}`"
        @click="emit('updateScope', currentOccurrence)"
      >
        {{ copy.currentOccurrence }}
      </button>
      <button
        v-if="currentFile"
        class="scope-segment"
        type="button"
        :aria-pressed="Boolean(scope.file) && !scope.location"
        :title="currentFile"
        @click="emit('updateScope', { file: currentFile })"
      >
        {{ copy.currentFile }}
      </button>
      <button
        class="scope-segment"
        type="button"
        :aria-pressed="!scope.file"
        @click="emit('updateScope', {})"
      >
        {{ copy.allFiles }}
      </button>
    </div>
  </section>
</template>
