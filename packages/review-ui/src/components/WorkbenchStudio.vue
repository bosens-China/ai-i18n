<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from 'vue';
import type { ReviewMessage, ReviewMutation } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';
import ReviewScopeTabs from './ReviewScopeTabs.vue';
import ReviewSourcePanel from './ReviewSourcePanel.vue';
import {
  activeOverride as findActiveOverride,
  reviewAction,
  reviewBaseline,
} from '../review-state';
import { extractTokens, validateTokens } from '../tokens';

const props = defineProps<{
  copy: ReviewCopy;
  draft: string;
  locale: string;
  message: ReviewMessage;
  scope: string;
}>();

const emit = defineEmits<{
  mutate: [
    mutation: ReviewMutation,
    advance: boolean,
    done: (success: boolean) => void,
  ];
  updateDraft: [draft: string];
  updateScope: [scope: string];
}>();

const busy = shallowRef(false);
const editor = useTemplateRef<HTMLTextAreaElement>('editor');
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
const tokens = computed(() => extractTokens(props.message.message.source));
const hasDraft = computed(() => props.draft.trim().length > 0);
const dirty = computed(() => hasDraft.value && action.value !== 'saved');
const validTokens = computed(() =>
  validateTokens(props.message.message.source, props.draft),
);
const canSave = computed(
  () =>
    hasDraft.value &&
    !busy.value &&
    action.value !== 'saved' &&
    validTokens.value,
);
const showTokenWarning = computed(() => hasDraft.value && !validTokens.value);
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

async function mutate(
  method: ReviewMutation['method'],
  advance = false,
): Promise<void> {
  if (method === 'POST' && !canSave.value) return;
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
      emit('mutate', mutation, advance, resolve);
    });
    if (success && advance) editor.value?.focus({ preventScroll: true });
  } finally {
    busy.value = false;
  }
}

function onInputKeyDown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    if (canSave.value) {
      void mutate('POST', event.shiftKey);
    }
  }
}

function updateDraft(event: Event): void {
  emit('updateDraft', (event.target as HTMLTextAreaElement).value);
}

function useAutomatic(): void {
  if (automatic.value !== null) emit('updateDraft', automatic.value);
}

function isTokenInserted(token: string): boolean {
  return props.draft.includes(token);
}

function insertToken(token: string): void {
  const input = editor.value;
  if (!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  emit(
    'updateDraft',
    `${props.draft.slice(0, start)}${token}${props.draft.slice(end)}`,
  );
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(start + token.length, start + token.length);
  });
}
</script>

<template>
  <article class="h-full flex flex-col overflow-hidden bg-bgSurface">
    <ReviewSourcePanel :copy="copy" :message="message" />

    <section class="flex-1 min-h-0 flex flex-col gap-4 p-5 overflow-y-auto">
      <div
        class="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-3.5 items-start"
      >
        <p
          class="m-0 text-accent font-mono text-[11px] font-bold tracking-wider uppercase"
        >
          {{ copy.machine }}
        </p>
        <div>
          <p
            class="m-0 text-muted text-xs leading-relaxed whitespace-pre-wrap break-words"
            :class="{ 'text-statusRed italic': automatic === null }"
          >
            {{ automatic === null ? copy.noMachine : automatic }}
          </p>
          <button
            v-if="automatic !== null"
            class="mt-1 p-0 border-0 bg-transparent text-accent text-xs font-bold hover:text-cyan hover:underline transition-colors"
            type="button"
            @click="useAutomatic"
          >
            {{ copy.useAutomatic }}
          </button>
        </div>
      </div>

      <div
        v-if="tokens.length"
        class="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-3.5 items-center"
      >
        <p
          class="m-0 text-accent font-mono text-[11px] font-bold tracking-wider uppercase"
        >
          {{ copy.tokens }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="token in tokens"
            :key="token"
            class="px-2 py-1 rounded-md border text-xs font-mono transition-colors"
            :class="
              isTokenInserted(token)
                ? 'border-statusGreen/35 text-statusGreen bg-statusGreenBg'
                : 'border-lineFocus text-accent bg-bgWash hover:border-accent hover:bg-bgWashHover'
            "
            type="button"
            @click="insertToken(token)"
          >
            <span
              v-if="isTokenInserted(token)"
              class="font-bold"
              aria-hidden="true"
              >✓ </span
            >{{ token }}
          </button>
        </div>
      </div>
      <p
        v-if="showTokenWarning"
        class="m-0 p-2.5 rounded-lg border border-statusRed/40 bg-statusRedBg text-statusRed text-xs leading-relaxed"
        role="alert"
      >
        {{ copy.tokenMismatch }}
      </p>

      <div class="flex items-center">
        <p
          class="m-0 flex items-center gap-2 text-accent font-mono text-[11px] font-bold tracking-wider uppercase"
        >
          {{ copy.final }}
          <span v-if="dirty" class="badge-dirty">{{ copy.unsaved }}</span>
        </p>
      </div>

      <ReviewScopeTabs
        :copy="copy"
        :message="message"
        :scope="scope"
        @update-scope="emit('updateScope', $event)"
      />

      <textarea
        ref="editor"
        class="review-input w-full min-h-[140px] flex-1 resize-y p-3.5 rounded-xl border border-line bg-bgWash text-ink text-sm leading-relaxed"
        :class="{ 'border-statusAmber bg-statusAmberBg/25': dirty }"
        :value="draft"
        :aria-label="`${copy.final}：${message.message.source}`"
        :placeholder="copy.enterTranslation"
        spellcheck="true"
        @input="updateDraft"
        @keydown="onInputKeyDown"
      />

      <div
        class="flex-none flex items-center justify-between pt-3 border-t border-line bg-bgSurface sticky bottom-0"
      >
        <button
          class="btn-quiet"
          type="button"
          :disabled="busy || !activeOverride"
          @click="mutate('DELETE')"
        >
          {{ copy.remove }}
        </button>
        <div class="flex gap-2">
          <button
            class="btn-primary"
            type="button"
            :disabled="!canSave"
            :aria-busy="busy"
            @click="mutate('POST')"
          >
            {{ primaryLabel }}
          </button>
          <button
            class="btn-primary bg-accentDark hover:bg-accent"
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

      <div
        class="flex-none flex flex-wrap gap-3.5 justify-end mt-1 text-[11px] text-dimmed"
        aria-hidden="true"
      >
        <span
          ><kbd
            class="px-1 py-0.5 rounded border border-lineFocus bg-bgWash font-mono text-[10px] text-muted"
            >⌘/Ctrl + Enter</kbd
          >
          {{ copy.shortcutSave }}</span
        >
        <span
          ><kbd
            class="px-1 py-0.5 rounded border border-lineFocus bg-bgWash font-mono text-[10px] text-muted"
            >⌘/Ctrl + Shift + Enter</kbd
          >
          {{ copy.shortcutContinue }}</span
        >
        <span
          ><kbd
            class="px-1 py-0.5 rounded border border-lineFocus bg-bgWash font-mono text-[10px] text-muted"
            >Alt+A</kbd
          >
          {{ copy.shortcutMachine }}</span
        >
        <span
          ><kbd
            class="px-1 py-0.5 rounded border border-lineFocus bg-bgWash font-mono text-[10px] text-muted"
            >↑ / ↓</kbd
          >
          {{ copy.shortcutNav }}</span
        >
      </div>
    </section>
  </article>
</template>
