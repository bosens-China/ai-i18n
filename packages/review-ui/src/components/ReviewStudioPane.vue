<script setup lang="ts">
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import type { ReviewCopy } from '@ai-i18n/core/review-i18n';
import type { ReviewScope } from '../review-state';
import WorkbenchStudio from './WorkbenchStudio.vue';

defineProps<{
  message: ReviewMessage | null;
  copy: ReviewCopy;
  compact: boolean;
  draftFor: (
    message: ReviewMessage,
    locale: string,
    scope: ReviewScope,
  ) => string;
  locale: string;
  requireOccurrence: boolean;
  scopeFor: (message: ReviewMessage) => ReviewScope;
}>();
const emit = defineEmits<{
  mutate: [
    mutation: ReviewMutation,
    advance: boolean,
    done: (success: boolean) => void,
  ];
  updateDraft: [draft: string];
  updateScope: [scope: ReviewScope];
}>();
</script>

<template>
  <section
    class="review-studio flex min-w-0 min-h-0 flex-col overflow-hidden bg-bgBase p-2"
  >
    <WorkbenchStudio
      v-if="message"
      :copy="copy"
      :compact="compact"
      :draft="draftFor(message, locale, scopeFor(message))"
      :locale="locale"
      :message="message"
      :require-occurrence="requireOccurrence"
      :scope="scopeFor(message)"
      @mutate="
        (mutation, advance, done) => emit('mutate', mutation, advance, done)
      "
      @update-draft="emit('updateDraft', $event)"
      @update-scope="emit('updateScope', $event)"
    />
    <div
      v-else
      class="h-full grid place-items-center p-12 text-center text-muted text-sm leading-relaxed"
    >
      {{ requireOccurrence ? copy.chooseExactOccurrence : copy.selectMessage }}
    </div>
  </section>
</template>
