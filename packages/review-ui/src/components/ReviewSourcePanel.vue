<script setup lang="ts">
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';

defineProps<{
  copy: ReviewCopy;
  message: ReviewMessage;
}>();

function fileLabel(sourceFile: string, line?: number): string {
  return `${sourceFile}${line ? `:${line}` : ''}`;
}
</script>

<template>
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
</template>

<style scoped>
.source-panel {
  padding: 22px 24px 22px 28px;
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
</style>
