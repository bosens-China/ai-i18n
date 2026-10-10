<script setup lang="ts">
import type { ReviewMessageReference } from '@ai-i18n/core';
import type { ReviewCopy } from '@ai-i18n/core/review-i18n';
import { useReviewCandidates } from '../composables/useReviewCandidates';

const props = defineProps<{
  message: ReviewMessageReference;
  locale: string;
  currentValue: string;
  copy: ReviewCopy;
  disabled: boolean;
}>();
const emit = defineEmits<{ use: [value: string] }>();
const { page, loading, failed, load } = useReviewCandidates(
  () => props.message,
  () => props.locale,
);
</script>

<template>
  <section
    class="max-h-56 shrink-0 overflow-y-auto rounded-lg border border-line p-3 text-xs"
    :aria-label="copy.cacheCandidates"
    :aria-busy="loading"
  >
    <strong class="text-accent">{{ copy.cacheCandidates }}</strong>
    <p class="text-muted">{{ copy.cacheCandidatesHint }}</p>
    <p v-if="loading" role="status">{{ copy.cacheCandidatesLoading }}</p>
    <div v-if="failed" role="alert">
      {{ copy.cacheCandidatesFailed }}
      <button
        type="button"
        class="btn-quiet"
        :disabled="loading"
        @click="load()"
      >
        {{ copy.retry }}
      </button>
    </div>
    <p v-else-if="!loading && !page.candidates.length" class="text-muted">
      {{ copy.cacheCandidatesEmpty }}
    </p>
    <ul class="m-0 p-0 list-none flex flex-col gap-3">
      <li
        v-for="candidate in page.candidates"
        :key="candidate.value"
        class="border-t border-line pt-2"
      >
        <p class="whitespace-pre-wrap break-words">
          {{ candidate.value || copy.emptyTranslation }}
        </p>
        <span v-if="candidate.value === currentValue" class="badge-reviewed">{{
          copy.currentValue
        }}</span>
        <ul class="text-muted pl-4 break-all">
          <li v-for="source in candidate.sources" :key="JSON.stringify(source)">
            {{
              source.kind === 'reviewed'
                ? copy.reviewedSource
                : copy.automaticSource
            }}
            · {{ source.project }}
            <template v-if="source.file"> · {{ source.file }}</template>
            <template v-if="source.location"
              >:{{ source.location.line }}:{{
                source.location.column + 1
              }}</template
            >
          </li>
        </ul>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="btn-quiet"
            :disabled="disabled || loading"
            @click="emit('use', candidate.value)"
          >
            {{ copy.useCandidate }}
          </button>
          <button
            v-if="candidate.sourcesHasMore"
            type="button"
            class="btn-quiet"
            :disabled="loading"
            @click="load('sources', candidate.value)"
          >
            {{ copy.moreSources }}
          </button>
        </div>
      </li>
    </ul>
    <button
      v-if="page.hasMore"
      type="button"
      class="btn-quiet mt-2"
      :disabled="loading"
      @click="load('more')"
    >
      {{ copy.moreCandidates }}
    </button>
  </section>
</template>
