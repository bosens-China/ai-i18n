<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue';
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import ReviewSourcePanel from './ReviewSourcePanel.vue';
import {
  activeOverride as findActiveOverride,
  reviewAction,
  reviewBaseline,
} from '../review-state';

const props = defineProps<{
  copy: ReviewCopy;
  draft: string;
  locale: string;
  message: ReviewMessage;
  scope: string;
}>();

const emit = defineEmits<{
  mutate: [mutation: ReviewMutation, done: (success: boolean) => void];
  updateDraft: [draft: string];
  updateScope: [scope: string];
}>();

const busy = shallowRef(false);
const proof = useTemplateRef<HTMLElement>('proof');
const automatic = computed(
  () => props.message.translations[props.locale] ?? null,
);
const activeOverride = computed(() =>
  findActiveOverride(props.message, props.locale, props.scope),
);
const baseline = computed(() =>
  reviewBaseline(props.message, props.locale, props.scope),
);
const action = computed(() =>
  reviewAction(Boolean(activeOverride.value), props.draft, baseline.value),
);
const dirty = computed(() => action.value === 'save');
const canSave = computed(() => !busy.value && action.value !== 'saved');
const primaryLabel = computed(() => {
  if (action.value === 'confirm') return props.copy.confirm;
  if (action.value === 'save') return props.copy.saveChanges;
  return props.copy.savedState;
});
const continueLabel = computed(() =>
  action.value === 'confirm'
    ? props.copy.confirmAndContinue
    : props.copy.saveAndContinue,
);
const reviewed = computed(() =>
  props.message.overrides.some((item) => item.locale === props.locale),
);
const occurrenceCount = computed(() =>
  props.message.occurrences.reduce(
    (count, item) => count + item.locations.length,
    0,
  ),
);

function fileLabel(sourceFile: string, line?: number): string {
  return `${sourceFile}${line ? `:${line}` : ''}`;
}

async function mutate(
  method: ReviewMutation['method'],
  advance = false,
): Promise<void> {
  if (method === 'POST' && !canSave.value) return;

  const nextInput = advance
    ? proof.value?.nextElementSibling?.querySelector<HTMLTextAreaElement>(
        '.review-input',
      )
    : null;
  busy.value = true;
  const mutation: ReviewMutation = {
    message: props.message.message,
    locale: props.locale,
    method,
    ...(props.scope ? { file: props.scope } : {}),
    ...(method === 'POST' ? { value: props.draft } : {}),
  };
  try {
    const success = await new Promise<boolean>((resolve) => {
      emit('mutate', mutation, resolve);
    });
    if (success && nextInput) {
      await nextTick();
      nextInput.focus({ preventScroll: true });
      nextInput.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'center',
      });
    }
  } finally {
    busy.value = false;
  }
}

function updateDraft(event: Event): void {
  emit('updateDraft', (event.target as HTMLTextAreaElement).value);
}

function handleSaveShortcut(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
  event.preventDefault();
  void mutate('POST', true);
}
</script>

<template>
  <article ref="proof" class="proof" :class="{ reviewed }">
    <ReviewSourcePanel :copy="copy" :message="message" />

    <section class="review-panel">
      <div class="machine-row">
        <p class="proof-label">{{ copy.machine }}</p>
        <p class="machine-value" :class="{ missing: automatic === null }">
          {{ automatic === null ? copy.noMachine : automatic }}
        </p>
      </div>

      <div class="editor-head">
        <p class="proof-label editor-label">
          {{ copy.final }}
          <span v-if="dirty" class="dirty-badge">{{ copy.unsaved }}</span>
        </p>
        <label>
          <span class="utility-label">{{ copy.scope }}</span>
          <select
            class="scope-select"
            :value="scope"
            :aria-label="`${copy.scope}：${message.message.source}`"
            @change="
              emit('updateScope', ($event.target as HTMLSelectElement).value)
            "
          >
            <option value="">{{ copy.global }}</option>
            <option
              v-for="item in message.occurrences"
              :key="item.sourceFile"
              :value="item.sourceFile"
            >
              {{ fileLabel(item.sourceFile, item.locations[0]?.line) }}
            </option>
          </select>
        </label>
      </div>

      <textarea
        class="review-input"
        :class="{ dirty }"
        :value="draft"
        :aria-label="`${copy.final}：${message.message.source}`"
        spellcheck="true"
        @input="updateDraft"
        @keydown="handleSaveShortcut"
      />

      <div class="actions">
        <span class="scope-note">
          {{ occurrenceCount }} {{ copy.occurrences }} · {{ copy.shortcut }}
        </span>
        <button
          class="button button-quiet"
          type="button"
          :disabled="busy || !activeOverride"
          @click="mutate('DELETE')"
        >
          {{ copy.remove }}
        </button>
        <div class="primary-actions">
          <button
            class="button button-primary"
            type="button"
            :disabled="!canSave"
            :aria-busy="busy"
            @click="mutate('POST')"
          >
            {{ primaryLabel }}
          </button>
          <button
            class="button button-primary button-continue"
            type="button"
            :disabled="!canSave"
            :aria-busy="busy"
            :aria-label="continueLabel"
            :title="continueLabel"
            @click="mutate('POST', true)"
          >
            {{ copy.continue }}
          </button>
        </div>
      </div>
    </section>
  </article>
</template>

<style scoped>
.proof {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(220px, 0.85fr) minmax(320px, 1.15fr);
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--paper);
  box-shadow: 0 8px 24px rgb(31 51 92 / 6%);
}

.proof::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  content: '';
  background: var(--blue);
}

.proof.reviewed::before {
  background: var(--green);
}

.review-panel {
  padding: 22px 24px 22px 28px;
  display: grid;
  gap: 14px;
}

.machine-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 14px;
  align-items: start;
}

.machine-value {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.machine-value.missing {
  color: var(--red);
  font-style: italic;
}

.editor-head {
  display: grid;
  grid-template-columns: 1fr minmax(180px, 0.7fr);
  gap: 12px;
  align-items: end;
}

.editor-label {
  display: flex;
  gap: 9px;
  align-items: center;
}

.dirty-badge {
  padding: 3px 7px;
  border-radius: 999px;
  color: #8a4b00;
  background: #fff0cc;
  font-family: var(--font-sans);
  font-size: 0.68rem;
  letter-spacing: 0;
  text-transform: none;
}

.scope-select {
  width: 100%;
  height: 38px;
  padding: 0 34px 0 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--ink);
  background: white;
  font-size: 0.82rem;
}

.review-input {
  width: 100%;
  min-height: 88px;
  resize: vertical;
  padding: 12px 14px;
  border: 1px solid #b9c4d8;
  border-radius: 10px;
  color: var(--ink);
  background: #fbfcff;
  line-height: 1.5;
}

.review-input:focus {
  border-color: var(--blue);
  background: white;
}

.review-input.dirty {
  border-color: #d39a2f;
  background: #fffdf7;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  align-items: center;
}

.button {
  min-height: 38px;
  padding: 0 15px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 0.86rem;
  font-weight: 700;
}

.button-primary {
  color: white;
  background: var(--blue);
}

.button-primary:hover {
  background: var(--blue-dark);
}

.primary-actions {
  display: flex;
}

.primary-actions .button-primary {
  border-radius: 10px 0 0 10px;
}

.primary-actions .button-continue {
  margin-left: 1px;
  padding-inline: 12px;
  border-radius: 0 10px 10px 0;
  background: var(--blue-dark);
}

.button-quiet {
  border-color: var(--line);
  color: var(--red);
  background: white;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.button[aria-busy='true'] {
  cursor: wait;
}

.scope-note {
  margin-right: auto;
  color: var(--muted);
  font-size: 0.76rem;
}

@media (prefers-reduced-motion: no-preference) {
  .proof {
    animation: proof-in 260ms ease both;
  }

  @keyframes proof-in {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
  }
}
</style>
