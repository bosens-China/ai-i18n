<script setup lang="ts">
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import ReviewCard from './ReviewCard.vue';
import type { ReviewCopy } from '../copy';

defineProps<{
  copy: ReviewCopy;
  loading: boolean;
  locale: string;
  messages: ReviewMessage[];
  total: number;
  draftFor: (message: ReviewMessage, locale: string, scope: string) => string;
  scopeFor: (message: ReviewMessage) => string;
}>();

const emit = defineEmits<{
  mutate: [mutation: ReviewMutation, done: (success: boolean) => void];
  updateDraft: [
    message: ReviewMessage,
    locale: string,
    scope: string,
    value: string,
  ];
  updateScope: [message: ReviewMessage, scope: string];
}>();
</script>

<template>
  <main class="proof-list">
    <ReviewCard
      v-for="message in messages"
      :key="JSON.stringify(message.message)"
      :copy="copy"
      :draft="draftFor(message, locale, scopeFor(message))"
      :locale="locale"
      :message="message"
      :scope="scopeFor(message)"
      @mutate="(mutation, done) => emit('mutate', mutation, done)"
      @update-draft="
        emit('updateDraft', message, locale, scopeFor(message), $event)
      "
      @update-scope="emit('updateScope', message, $event)"
    />

    <div v-if="!loading && messages.length === 0" class="empty">
      {{ total ? copy.noResults : copy.noMessages }}
    </div>
  </main>
</template>

<style scoped>
.proof-list {
  display: grid;
  gap: 14px;
}

.empty {
  padding: 72px 24px;
  border: 1px dashed #aab7ce;
  border-radius: 16px;
  color: var(--muted);
  background: rgb(255 255 255 / 66%);
  text-align: center;
}
</style>
