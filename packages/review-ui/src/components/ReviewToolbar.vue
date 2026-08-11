<script setup lang="ts">
import type { ReviewFilter, ReviewLocale } from '@ai-i18n/core';
import type { ReviewCopy } from '../copy';

defineProps<{
  copy: ReviewCopy;
  locales: readonly ReviewLocale[];
}>();

const locale = defineModel<string>('locale', { required: true });
const filter = defineModel<ReviewFilter>('filter', { required: true });
const query = defineModel<string>('query', { required: true });
</script>

<template>
  <section class="control-room" :aria-label="copy.filtersLabel">
    <label class="search-wrap">
      <span class="search-icon" aria-hidden="true">⌕</span>
      <span class="utility-label sr-only">{{ copy.search }}</span>
      <input
        v-model="query"
        class="search"
        type="search"
        :aria-label="copy.search"
        :placeholder="copy.search"
      />
    </label>

    <div class="control-groups">
      <div class="segmented" :aria-label="copy.localesLabel">
        <button
          v-for="item in locales"
          :key="item.value"
          class="segment"
          type="button"
          :aria-pressed="item.value === locale"
          @click="locale = item.value"
        >
          {{ item.label || item.value }}
        </button>
      </div>

      <div class="segmented" :aria-label="copy.statusLabel">
        <button
          v-for="item in [
            { value: 'all' as const, label: copy.all },
            { value: 'unreviewed' as const, label: copy.unreviewed },
            { value: 'reviewed' as const, label: copy.reviewed },
          ]"
          :key="item.value"
          class="segment"
          type="button"
          :aria-pressed="item.value === filter"
          @click="filter = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.control-room {
  position: sticky;
  z-index: 10;
  top: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgb(255 255 255 / 94%);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.search-wrap {
  position: relative;
}

.search-icon {
  position: absolute;
  top: 50%;
  left: 15px;
  color: var(--blue);
  font-size: 1.3rem;
  transform: translateY(-55%);
}

.search {
  width: 100%;
  height: 44px;
  padding: 0 16px 0 44px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--ink);
  background: var(--wash);
}

.control-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.segmented {
  display: flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--wash);
}

.segment {
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  color: var(--muted);
  background: transparent;
  font-size: 0.86rem;
  font-weight: 650;
}

.segment[aria-pressed='true'] {
  color: white;
  background: var(--blue);
}

@media (max-width: 900px) {
  .control-room {
    grid-template-columns: 1fr;
  }

  .control-groups {
    justify-content: flex-start;
  }
}

@media (max-width: 580px) {
  .control-room {
    position: static;
  }

  .control-groups,
  .segmented {
    width: 100%;
  }

  .segmented {
    overflow-x: auto;
  }

  .segment {
    flex: 1 0 auto;
  }
}
</style>
