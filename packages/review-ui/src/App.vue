<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  shallowRef,
  watch,
} from 'vue';
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import ReviewBrowseScope from './components/ReviewBrowseScope.vue';
import ReviewLocateResults from './components/ReviewLocateResults.vue';
import ReviewToolbar from './components/ReviewToolbar.vue';
import WorkbenchList from './components/WorkbenchList.vue';
import WorkbenchStudio from './components/WorkbenchStudio.vue';
import { reviewCopy } from './copy';
import { useReviewConsole } from './composables/useReviewConsole';
import { useReviewDrafts } from './composables/useReviewDrafts';
import { useReviewSelection } from './composables/useReviewSelection';
import type { ReviewHostSelection, ReviewHostState } from './host-state';
import {
  messageKey,
  type ReviewOccurrenceTarget,
  type ReviewScope,
} from './review-state';

const props = defineProps<{ host: ReviewHostState }>();
const copy = reviewCopy();
const review = useReviewConsole(copy);
const drafts = useReviewDrafts();
const scopes = reactive(new Map<string, ReviewScope>());
const browseScope = shallowRef<'page' | 'all'>('page');
const candidateKeys = shallowRef<ReadonlySet<string> | null>(null);
const pageKeys = computed(() => new Set<string>(props.host.pageMessageKeys));
const allMessages = computed<readonly ReviewMessage[]>(
  () =>
    (review.snapshot.value?.messages as unknown as readonly ReviewMessage[]) ??
    [],
);
const activeMessages = computed(() => {
  const candidates = candidateKeys.value;
  if (candidates) {
    return allMessages.value.filter((message) =>
      candidates.has(messageKey(message.message)),
    );
  }
  if (browseScope.value === 'all') return allMessages.value;
  return allMessages.value.filter((message) =>
    pageKeys.value.has(messageKey(message.message)),
  );
});
const activeKeys = computed(
  () => new Set(activeMessages.value.map((item) => messageKey(item.message))),
);
const visibleMessages = computed(() =>
  review.visibleMessages.value.filter((message) =>
    activeKeys.value.has(messageKey(message.message)),
  ),
);
const selection = useReviewSelection(() => visibleMessages.value, {
  autoSelect: () => candidateKeys.value === null,
});
const total = computed(() => activeMessages.value.length);
const confirmedCount = computed(
  () =>
    activeMessages.value.filter((message) =>
      message.overrides.some((item) => item.locale === review.locale.value),
    ).length,
);
const candidateMode = computed(() => candidateKeys.value !== null);
let stopAutoRefresh: (() => void) | undefined;

function handleKeyDown(event: KeyboardEvent): void {
  const isInputTarget = event
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement,
    );

  if (
    !isInputTarget &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  ) {
    const list = visibleMessages.value;
    if (!list.length) return;
    const current = selection.selectedMessage.value;
    if (!current) {
      selection.select(list[0]!);
      event.preventDefault();
      return;
    }
    const index = list.findIndex(
      (message) => messageKey(message.message) === selection.selectedKey.value,
    );
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (index !== -1 && next >= 0 && next < list.length) {
      selection.select(list[next]!);
      event.preventDefault();
    }
  }

  if (event.altKey && event.code === 'KeyA') {
    const message = selection.selectedMessage.value;
    const automatic = message?.translations[review.locale.value];
    if (message && automatic) {
      drafts.updateDraft(
        message,
        review.locale.value,
        scopeFor(message),
        automatic,
      );
      event.preventDefault();
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

watch(
  () => props.host.selection,
  (next) => {
    if (next) applyHostSelection(next);
  },
  { deep: false },
);

function applyHostSelection(data: ReviewHostSelection): void {
  if (data.exact && data.candidateKeys.includes(data.exact.key)) {
    candidateKeys.value = null;
    scopes.set(data.exact.key, {
      file: data.exact.file,
      location: { ...data.exact.location },
    });
    selection.selectKey(data.exact.key);
    return;
  }
  if (data.candidateKeys.length === 1) {
    candidateKeys.value = null;
    scopes.delete(data.candidateKeys[0]!);
    selection.selectKey(data.candidateKeys[0]!);
    return;
  }
  candidateKeys.value = new Set(data.candidateKeys);
  selection.clear();
}

function showBrowse(): void {
  candidateKeys.value = null;
}

function selectLocateResult(
  message: ReviewMessage,
  target: ReviewOccurrenceTarget,
): void {
  scopes.set(messageKey(message.message), target);
  selection.select(message);
}

function scopeFor(message: ReviewMessage): ReviewScope {
  return scopes.get(messageKey(message.message)) ?? {};
}

function updateScope(message: ReviewMessage, scope: ReviewScope): void {
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
  <div class="review-shell h-full w-full flex flex-col overflow-hidden">
    <main
      class="review-workspace flex-1 min-h-0 grid overflow-hidden border border-line bg-bgSurface"
    >
      <aside
        class="review-sidebar flex flex-col min-w-0 min-h-0 border-r border-line bg-bgSurface"
      >
        <ReviewLocateResults
          v-if="candidateMode"
          :candidate-keys="candidateKeys!"
          :copy="copy"
          :messages="allMessages"
          @back="showBrowse"
          @select="selectLocateResult"
        />
        <template v-else>
          <ReviewBrowseScope
            v-model="browseScope"
            :all-count="allMessages.length"
            :copy="copy"
            :page-count="pageKeys.size"
          />
          <ReviewToolbar
            v-model:filter="review.filter.value"
            v-model:locale="review.locale.value"
            v-model:query="review.query.value"
            :copy="copy"
            compact
            :locales="review.snapshot.value?.locales ?? []"
          />

          <div
            class="flex-none flex justify-between items-center px-4 py-2.5 border-b border-line bg-bgWash text-xs text-muted"
            aria-live="polite"
          >
            <span>
              {{ copy.showing }}
              <strong class="text-ink font-bold">{{
                visibleMessages.length
              }}</strong>
              {{ copy.of }}
              <strong class="text-ink font-bold">{{ total }}</strong>
              {{ copy.messages }}
            </span>
            <span>
              <strong class="text-ink font-bold">{{ confirmedCount }}</strong>
              / {{ total }} {{ copy.reviewed }}
            </span>
          </div>

          <WorkbenchList
            v-if="!review.loading.value && visibleMessages.length"
            :copy="copy"
            :locale="review.locale.value"
            :messages="visibleMessages"
            :selected-key="selection.selectedKey.value"
            @select="selection.select"
          />
          <div
            v-else-if="!review.loading.value"
            class="p-12 text-center text-muted m-auto"
          >
            {{ total ? copy.noResults : copy.noMessages }}
          </div>
        </template>
      </aside>

      <section
        class="review-studio flex flex-col min-w-0 min-h-0 overflow-hidden bg-bgSurface"
      >
        <WorkbenchStudio
          v-if="selection.selectedMessage.value"
          :copy="copy"
          compact
          :draft="
            drafts.draftFor(
              selection.selectedMessage.value,
              review.locale.value,
              scopeFor(selection.selectedMessage.value),
            )
          "
          :locale="review.locale.value"
          :message="selection.selectedMessage.value"
          :require-occurrence="candidateMode"
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
    class="absolute z-30 right-6 bottom-6 max-w-[420px] px-4.5 py-3 rounded-xl border border-line bg-bgOverlay text-ink shadow-2xl text-sm leading-snug"
    :class="{
      'border-statusRedBg bg-statusRedBg text-statusRed':
        review.toast.value.error,
    }"
    role="status"
  >
    {{ review.toast.value.message }}
  </div>
</template>
