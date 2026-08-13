<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import { currentReviewFile } from '../review-state';

const props = defineProps<{
  copy: ReviewCopy;
  message: ReviewMessage;
  scope: string;
}>();

const emit = defineEmits<{ updateScope: [scope: string] }>();
const currentFile = computed(() => currentReviewFile(props.message));
</script>

<template>
  <section
    class="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-3.5 items-center"
    :aria-label="copy.scope"
  >
    <p
      class="m-0 text-accent font-mono text-[11px] font-bold tracking-wider uppercase"
    >
      {{ copy.scope }}
    </p>
    <div
      class="inline-flex w-fit max-w-full gap-1 overflow-x-auto p-1 rounded-lg border border-line bg-bgWash scrollbar-none"
      role="group"
      :aria-label="copy.scope"
    >
      <button
        v-if="currentFile"
        class="scope-segment"
        type="button"
        :aria-pressed="scope === currentFile"
        :title="currentFile"
        @click="emit('updateScope', currentFile)"
      >
        {{ copy.currentFile }}
      </button>
      <button
        class="scope-segment"
        type="button"
        :aria-pressed="!scope"
        @click="emit('updateScope', '')"
      >
        {{ copy.allFiles }}
      </button>
    </div>
  </section>
</template>
