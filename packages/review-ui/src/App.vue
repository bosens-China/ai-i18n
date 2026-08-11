<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import ReviewList from './components/ReviewList.vue';
import ReviewToolbar from './components/ReviewToolbar.vue';
import { reviewCopy } from './copy';
import { useReviewConsole } from './composables/useReviewConsole';

const copy = reviewCopy();
const review = useReviewConsole(copy);
const scopes = reactive(new Map<string, string>());

onMounted(review.load);

function messageKey(message: ReviewMessage): string {
  return JSON.stringify([
    message.message.source,
    message.message.comment ?? null,
  ]);
}

function scopeFor(message: ReviewMessage): string {
  return scopes.get(messageKey(message)) ?? '';
}

function updateScope(message: ReviewMessage, scope: string): void {
  scopes.set(messageKey(message), scope);
}

async function mutate(
  mutation: ReviewMutation,
  done: () => void,
): Promise<void> {
  await review.mutate(mutation);
  done();
}
</script>

<template>
  <div class="shell">
    <header class="masthead">
      <div>
        <p class="eyebrow">{{ copy.eyebrow }}</p>
        <h1 class="title">{{ copy.title }}</h1>
      </div>
      <p class="masthead-copy">{{ copy.description }}</p>
    </header>

    <ReviewToolbar
      v-model:filter="review.filter.value"
      v-model:locale="review.locale.value"
      v-model:query="review.query.value"
      :copy="copy"
      :locales="review.snapshot.value?.locales ?? []"
    />

    <div class="stats" aria-live="polite">
      {{ copy.showing }}
      <strong>{{ review.visibleMessages.value.length }}</strong>
      {{ copy.of }}
      <strong>{{ review.snapshot.value?.messages.length ?? 0 }}</strong>
      {{ copy.messages }}
    </div>

    <ReviewList
      :copy="copy"
      :loading="review.loading.value"
      :locale="review.locale.value"
      :messages="review.visibleMessages.value"
      :scope-for="scopeFor"
      :total="review.snapshot.value?.messages.length ?? 0"
      @mutate="mutate"
      @update-scope="updateScope"
    />
  </div>

  <div
    v-if="review.toast.value"
    class="toast"
    :class="{ error: review.toast.value.error }"
    role="status"
  >
    {{ review.toast.value.message }}
  </div>
</template>
