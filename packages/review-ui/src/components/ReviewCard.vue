<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';

const props = defineProps<{
  copy: ReviewCopy;
  locale: string;
  message: ReviewMessage;
  scope: string;
}>();

const emit = defineEmits<{
  mutate: [mutation: ReviewMutation, done: () => void];
  updateScope: [scope: string];
}>();

const busy = shallowRef(false);
const draft = shallowRef('');
const automatic = computed(
  () => props.message.translations[props.locale] ?? null,
);
const activeOverride = computed(() =>
  props.message.overrides.find(
    (item) => item.locale === props.locale && (item.file ?? '') === props.scope,
  ),
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

watch(
  [activeOverride, automatic, () => props.message.message.source],
  ([override, translated, source]) => {
    draft.value = override?.value ?? translated ?? source;
  },
  { immediate: true },
);

function fileLabel(sourceFile: string, line?: number): string {
  return `${sourceFile}${line ? `:${line}` : ''}`;
}

async function mutate(method: ReviewMutation['method']): Promise<void> {
  busy.value = true;
  const mutation: ReviewMutation = {
    message: props.message.message,
    locale: props.locale,
    method,
    ...(props.scope ? { file: props.scope } : {}),
    ...(method === 'POST' ? { value: draft.value } : {}),
  };
  try {
    await new Promise<void>((resolve) => {
      emit('mutate', mutation, resolve);
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <article class="proof" :class="{ reviewed }">
    <section class="source-panel">
      <p class="proof-label">{{ copy.source }}</p>
      <p class="source-text">{{ message.message.source }}</p>
      <p v-if="message.message.comment" class="comment">
        <span class="proof-label">{{ copy.context }}</span>
        <br />
        {{ message.message.comment }}
      </p>
      <ul class="occurrences">
        <li v-for="item in message.occurrences" :key="item.sourceFile">
          {{ fileLabel(item.sourceFile, item.locations[0]?.line) }}
        </li>
      </ul>
    </section>

    <section class="review-panel">
      <div class="machine-row">
        <p class="proof-label">{{ copy.machine }}</p>
        <p class="machine-value" :class="{ missing: automatic === null }">
          {{ automatic === null ? copy.noMachine : automatic }}
        </p>
      </div>

      <div class="editor-head">
        <p class="proof-label">{{ copy.final }}</p>
        <label>
          <span class="utility-label">{{ copy.scope }}</span>
          <select
            class="scope-select"
            :value="scope"
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
        v-model="draft"
        class="review-input"
        :aria-label="copy.final"
        spellcheck="true"
      />

      <div class="actions">
        <span class="scope-note">
          {{ occurrenceCount }} {{ copy.occurrences }}
        </span>
        <button
          class="button button-quiet"
          type="button"
          :disabled="busy || !activeOverride"
          @click="mutate('DELETE')"
        >
          {{ copy.remove }}
        </button>
        <button
          class="button button-primary"
          type="button"
          :disabled="busy"
          @click="mutate('POST')"
        >
          {{ copy.save }}
        </button>
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

.source-panel,
.review-panel {
  padding: 22px 24px 22px 28px;
}

.source-panel {
  border-right: 1px solid var(--line);
  background: var(--wash);
}

.source-text {
  margin: 10px 0 12px;
  color: var(--ink);
  font-size: 1.05rem;
  font-weight: 680;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comment {
  margin: 0 0 14px;
  padding-left: 10px;
  border-left: 2px solid var(--cyan);
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.5;
}

.occurrences {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.occurrences li {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}

.review-panel {
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

.button-quiet {
  border-color: var(--line);
  color: var(--red);
  background: white;
}

.button:disabled {
  cursor: wait;
  opacity: 0.52;
}

.scope-note {
  margin-right: auto;
  color: var(--muted);
  font-size: 0.76rem;
}

@media (max-width: 900px) {
  .proof {
    grid-template-columns: 1fr;
  }

  .source-panel {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}

@media (max-width: 580px) {
  .source-panel,
  .review-panel {
    padding: 18px 18px 18px 22px;
  }

  .machine-row,
  .editor-head {
    grid-template-columns: 1fr;
  }

  .actions {
    flex-wrap: wrap;
  }
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
