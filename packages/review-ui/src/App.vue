<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from 'vue';
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import ReviewToolbar from './components/ReviewToolbar.vue';
import WorkbenchList from './components/WorkbenchList.vue';
import WorkbenchStudio from './components/WorkbenchStudio.vue';
import { reviewCopy } from './copy';
import { useReviewConsole } from './composables/useReviewConsole';
import { useReviewDrafts } from './composables/useReviewDrafts';
import { useReviewSelection } from './composables/useReviewSelection';
import { messageKey } from './review-state';

const copy = reviewCopy();
const review = useReviewConsole(copy);
const drafts = useReviewDrafts();
const scopes = reactive(new Map<string, string>());
const selection = useReviewSelection(() => review.visibleMessages.value);
const total = computed(() => review.snapshot.value?.messages.length ?? 0);
let stopAutoRefresh: (() => void) | undefined;

function handleKeyDown(event: KeyboardEvent): void {
  const isInputTarget =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement;

  if (
    !isInputTarget &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  ) {
    const list = review.visibleMessages.value;
    if (!list.length) return;
    const current = selection.selectedMessage.value;
    if (!current) {
      selection.select(list[0]);
      event.preventDefault();
      return;
    }
    const idx = list.findIndex(
      (m) => messageKey(m.message) === selection.selectedKey.value,
    );
    if (idx !== -1) {
      const nextIdx = event.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (nextIdx >= 0 && nextIdx < list.length) {
        selection.select(list[nextIdx]);
        event.preventDefault();
      }
    }
  }

  if (event.altKey && event.code === 'KeyA') {
    const msg = selection.selectedMessage.value;
    if (msg) {
      const auto = msg.translations[review.locale.value];
      if (auto) {
        drafts.updateDraft(msg, review.locale.value, scopeFor(msg), auto);
        event.preventDefault();
      }
    }
  }
}

onMounted(() => {
  void review.load();
  stopAutoRefresh = review.startAutoRefresh();
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  stopAutoRefresh?.();
  window.removeEventListener('keydown', handleKeyDown);
});

function scopeFor(message: ReviewMessage): string {
  return scopes.get(messageKey(message.message)) ?? '';
}

function updateScope(message: ReviewMessage, scope: string): void {
  scopes.set(messageKey(message.message), scope);
}

async function mutate(
  mutation: ReviewMutation,
  advance: boolean,
  done: (success: boolean) => void,
): Promise<void> {
  const previous = selection.selectedMessage.value;
  const success = await review.mutate(mutation);
  if (success) {
    drafts.clearDraft(mutation);
    if (advance && previous) selection.selectNext(previous);
  }
  done(success);
}
</script>

<template>
  <div
    class="h-screen w-full max-w-[1600px] mx-auto p-4 flex flex-col overflow-hidden box-border"
  >
    <header
      class="flex-none flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-3"
    >
      <div>
        <p
          class="m-0 text-accent font-mono text-[11px] font-bold tracking-widest uppercase"
        >
          {{ copy.eyebrow }}
        </p>
        <h1
          class="m-0 mt-0.5 text-ink text-xl md:text-2xl font-extrabold tracking-tight leading-none"
        >
          {{ copy.title }}
        </h1>
      </div>
      <p
        class="m-0 text-muted text-xs md:text-right max-w-[480px] leading-relaxed"
      >
        {{ copy.description }}
      </p>
    </header>

    <main
      class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[360px_1fr] overflow-hidden rounded-2xl border border-line bg-bgSurface shadow-2xl"
    >
      <aside
        class="flex flex-col min-w-0 min-h-0 border-r border-line bg-bgSurface"
      >
        <ReviewToolbar
          v-model:filter="review.filter.value"
          v-model:locale="review.locale.value"
          v-model:query="review.query.value"
          :copy="copy"
          :locales="review.snapshot.value?.locales ?? []"
        />

        <div
          class="flex-none flex justify-between items-center px-4 py-2.5 border-b border-line bg-bgWash text-xs text-muted"
          aria-live="polite"
        >
          <span>
            {{ copy.showing }}
            <strong class="text-ink font-bold">{{
              review.visibleMessages.value.length
            }}</strong>
            {{ copy.of }}
            <strong class="text-ink font-bold">{{ total }}</strong>
            {{ copy.messages }}
          </span>
          <span>
            <strong class="text-ink font-bold">{{
              review.confirmedCount.value
            }}</strong>
            / {{ total }} {{ copy.reviewed }}
          </span>
        </div>

        <WorkbenchList
          v-if="!review.loading.value && review.visibleMessages.value.length"
          :copy="copy"
          :locale="review.locale.value"
          :messages="review.visibleMessages.value"
          :selected-key="selection.selectedKey.value"
          @select="selection.select"
        />
        <div
          v-else-if="!review.loading.value"
          class="p-12 text-center text-muted m-auto"
        >
          {{ total ? copy.noResults : copy.noMessages }}
        </div>
      </aside>

      <section
        class="flex flex-col min-w-0 min-h-0 overflow-hidden bg-bgSurface"
      >
        <WorkbenchStudio
          v-if="selection.selectedMessage.value"
          :copy="copy"
          :draft="
            drafts.draftFor(
              selection.selectedMessage.value,
              review.locale.value,
              scopeFor(selection.selectedMessage.value),
            )
          "
          :locale="review.locale.value"
          :message="selection.selectedMessage.value"
          :scope="scopeFor(selection.selectedMessage.value)"
          @mutate="mutate"
          @update-draft="
            drafts.updateDraft(
              selection.selectedMessage.value!,
              review.locale.value,
              scopeFor(selection.selectedMessage.value!),
              $event,
            )
          "
          @update-scope="updateScope(selection.selectedMessage.value!, $event)"
        />
        <div
          v-else
          class="h-full grid place-items-center p-12 text-center text-muted"
        >
          {{ copy.selectMessage }}
        </div>
      </section>
    </main>
  </div>

  <div
    v-if="review.toast.value"
    class="fixed z-30 right-6 bottom-6 max-w-[420px] px-4.5 py-3 rounded-xl border border-line bg-bgOverlay text-ink shadow-2xl text-sm leading-snug"
    :class="{
      'border-statusRedBg bg-statusRedBg text-statusRed':
        review.toast.value.error,
    }"
    role="status"
  >
    {{ review.toast.value.message }}
  </div>
</template>
