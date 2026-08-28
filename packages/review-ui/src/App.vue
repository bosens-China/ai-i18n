<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import type {
  ReviewMessage,
  ReviewMutation,
  ReviewWorkbenchSelection,
} from '@ai-i18n/core';
import ReviewFilterRail from './components/ReviewFilterRail.vue';
import ReviewHeader from './components/ReviewHeader.vue';
import ReviewLocaleRail from './components/ReviewLocaleRail.vue';
import ReviewLocateResults from './components/ReviewLocateResults.vue';
import ReviewSettingsPanel from './components/ReviewSettingsPanel.vue';
import ReviewStandaloneHeader from './components/ReviewStandaloneHeader.vue';
import ReviewWorkbenchTabs from './components/ReviewWorkbenchTabs.vue';
import type { ReviewWorkbenchTab } from './components/ReviewWorkbenchTabs.vue';
import WorkbenchList from './components/WorkbenchList.vue';
import WorkbenchStudio from './components/WorkbenchStudio.vue';
import { reviewCopy } from './copy';
import { useReviewConsole } from './composables/useReviewConsole';
import { useReviewDrafts } from './composables/useReviewDrafts';
import { useReviewKeyboardNavigation } from './composables/useReviewKeyboardNavigation';
import { useReviewLayout } from './composables/useReviewLayout';
import { useReviewSelection } from './composables/useReviewSelection';
import { useReviewTheme } from './composables/useReviewTheme';
import type { ReviewHostState } from './host-state';
import { hasMultipleReviewLocales } from './review-locales';
import {
  hasReviewPageContext,
  initialReviewWorkbenchTab,
  type ReviewWorkbenchMode,
} from './review-mode';
import {
  messageKey,
  type ReviewOccurrenceTarget,
  type ReviewScope,
} from './review-state';

const props = defineProps<{
  host: ReviewHostState;
  mode: ReviewWorkbenchMode;
  root: HTMLElement;
  onLocateMessage?: (messageKey: string) => void;
}>();
const copy = reviewCopy();
const isStandalone = props.mode === 'standalone';
const { preference: themePreference, setPreference: setThemePreference } =
  useReviewTheme(props.root);
const review = useReviewConsole(copy);
const drafts = useReviewDrafts();
const scopes = reactive(new Map<string, ReviewScope>());
const pageContext = hasReviewPageContext(props.mode);
const workbenchTab = shallowRef<ReviewWorkbenchTab>(
  initialReviewWorkbenchTab(props.mode),
);
const browseScope = computed(() =>
  workbenchTab.value === 'all' ? 'all' : 'page',
);
const workspaceRef = useTemplateRef<HTMLElement>('workspaceRef');
const { layoutMode } = useReviewLayout(
  () => workspaceRef.value ?? undefined,
  () => browseScope.value,
);
const candidateKeys = shallowRef<ReadonlySet<string> | null>(null);
const pageKeys = computed(() => new Set<string>(props.host.pageMessageKeys));
const allMessages = computed<readonly ReviewMessage[]>(
  () =>
    (review.snapshot.value?.messages as unknown as readonly ReviewMessage[]) ??
    [],
);
const locales = computed(() => review.snapshot.value?.locales ?? []);
const showLocaleRail = computed(() => hasMultipleReviewLocales(locales.value));
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
const filteredMessages = computed(() =>
  review.visibleMessages.value.filter((message) =>
    activeKeys.value.has(messageKey(message.message)),
  ),
);
const visibleMessages = computed(() =>
  browseScope.value === 'page' ? activeMessages.value : filteredMessages.value,
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
const showAllFilters = computed(
  () => browseScope.value === 'all' && !candidateMode.value,
);
let stopAutoRefresh: (() => void) | undefined;
useReviewKeyboardNavigation({
  active: () => workbenchTab.value !== 'settings',
  messages: () => visibleMessages.value,
  onUseAutomatic: () => {
    const message = selection.selectedMessage.value;
    const automatic = message?.translations[review.locale.value];
    if (!message || !automatic) return false;
    drafts.updateDraft(
      message,
      review.locale.value,
      scopeFor(message),
      automatic,
    );
    return true;
  },
  select: selection.select,
  selectedKey: () => selection.selectedKey.value,
});
onMounted(() => {
  void review.load();
  stopAutoRefresh = review.startAutoRefresh();
});
onUnmounted(() => {
  stopAutoRefresh?.();
});
watch(
  () => props.host.selection,
  (next) => {
    if (next && pageContext) {
      workbenchTab.value = 'page';
      applyHostSelection(next);
    }
  },
  { deep: false },
);
function applyHostSelection(data: ReviewWorkbenchSelection): void {
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
function selectMessage(message: ReviewMessage): void {
  selection.select(message);
  const key = messageKey(message.message);
  if (pageKeys.value.has(key)) props.onLocateMessage?.(key);
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
    <ReviewWorkbenchTabs
      v-if="!isStandalone"
      v-model="workbenchTab"
      :all-count="allMessages.length"
      :copy="copy"
      :page-count="pageKeys.size"
      :show-page="pageContext"
    />
    <ReviewStandaloneHeader
      v-else
      v-model="workbenchTab"
      :confirmed-count="confirmedCount"
      :copy="copy"
      :total="total"
      :visible-count="visibleMessages.length"
    />
    <ReviewSettingsPanel
      v-if="workbenchTab === 'settings'"
      :copy="copy"
      :preference="themePreference"
      @update-preference="setThemePreference"
    />
    <main
      v-else
      ref="workspaceRef"
      class="review-workspace flex-1 min-h-0 grid overflow-hidden bg-bgSurface"
      :data-layout="layoutMode"
      :data-mode="mode"
    >
      <ReviewLocateResults
        v-if="candidateMode"
        class="review-sidebar min-w-0 min-h-0 overflow-hidden border-r border-line"
        :candidate-keys="candidateKeys!"
        :copy="copy"
        :messages="allMessages"
        @back="showBrowse"
        @select="selectLocateResult"
      />

      <template v-else>
        <ReviewFilterRail
          v-if="isStandalone && showAllFilters"
          v-model:file-suffix="review.fileSuffix.value"
          v-model:filter="review.filter.value"
          v-model:query="review.query.value"
          class="review-standalone-toolbar min-w-0"
          :copy="copy"
          :file-suffixes="review.fileSuffixes.value"
          :locale="review.locale.value"
          :locales="locales"
          toolbar
          :vertical="false"
          @update-locale="review.locale.value = $event"
        />

        <ReviewFilterRail
          v-if="!isStandalone && showAllFilters && layoutMode === 'all-stacked'"
          v-model:file-suffix="review.fileSuffix.value"
          v-model:filter="review.filter.value"
          v-model:query="review.query.value"
          class="review-filters-stacked min-w-0"
          :copy="copy"
          :file-suffixes="review.fileSuffixes.value"
          :locale="review.locale.value"
          :locales="locales"
          :vertical="false"
          @update-locale="review.locale.value = $event"
        />

        <ReviewFilterRail
          v-if="!isStandalone && showAllFilters && layoutMode === 'all-wide'"
          v-model:file-suffix="review.fileSuffix.value"
          v-model:filter="review.filter.value"
          v-model:query="review.query.value"
          class="review-filters min-w-0 min-h-0 overflow-hidden"
          :copy="copy"
          :file-suffixes="review.fileSuffixes.value"
          :locale="review.locale.value"
          :locales="locales"
          vertical
          @update-locale="review.locale.value = $event"
        />

        <aside
          class="review-sidebar review-message-sidebar flex min-w-0 min-h-0 bg-bgSurface"
          :class="{
            'border-r border-line':
              !isStandalone && layoutMode !== 'all-stacked',
          }"
        >
          <ReviewLocaleRail
            v-if="showLocaleRail && !showAllFilters"
            :copy="copy"
            :locale="review.locale.value"
            :locales="locales"
            @update-locale="review.locale.value = $event"
          />

          <div class="review-message-pane flex flex-1 flex-col min-w-0 min-h-0">
            <ReviewFilterRail
              v-if="
                !isStandalone && showAllFilters && layoutMode === 'all-compact'
              "
              v-model:file-suffix="review.fileSuffix.value"
              v-model:filter="review.filter.value"
              v-model:query="review.query.value"
              :copy="copy"
              :file-suffixes="review.fileSuffixes.value"
              :locale="review.locale.value"
              :locales="locales"
              :vertical="false"
              @update-locale="review.locale.value = $event"
            />

            <ReviewHeader
              v-if="showAllFilters && !isStandalone"
              :confirmed-count="confirmedCount"
              :copy="copy"
              :total="total"
              :visible-count="visibleMessages.length"
            />

            <WorkbenchList
              v-if="!review.loading.value && visibleMessages.length"
              :copy="copy"
              :locale="review.locale.value"
              :messages="visibleMessages"
              :selected-key="selection.selectedKey.value"
              @select="selectMessage"
            />
            <div
              v-else-if="!review.loading.value"
              class="flex-1 grid place-items-center p-10 text-center text-muted text-sm leading-relaxed"
            >
              {{ total ? copy.noResults : copy.noMessages }}
            </div>
          </div>
        </aside>
      </template>

      <section
        class="review-studio flex min-w-0 min-h-0 flex-col overflow-hidden bg-bgBase p-2"
      >
        <WorkbenchStudio
          v-if="selection.selectedMessage.value"
          :copy="copy"
          :compact="!isStandalone"
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
          class="h-full grid place-items-center p-12 text-center text-muted text-sm leading-relaxed"
        >
          {{ candidateMode ? copy.chooseExactOccurrence : copy.selectMessage }}
        </div>
      </section>
    </main>
  </div>

  <div
    v-if="review.toast.value"
    class="absolute z-30 right-6 bottom-6 max-w-[420px] px-4.5 py-3 rounded-xl border border-line bg-bgOverlay text-ink shadow-2xl text-sm leading-snug"
    :class="{
      'border-statusRed/40 bg-statusRedBg text-statusRed':
        review.toast.value.error,
    }"
    role="status"
  >
    {{ review.toast.value.message }}
  </div>
</template>
