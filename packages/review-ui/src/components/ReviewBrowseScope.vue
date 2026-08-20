<script setup lang="ts">
import type { ReviewCopy } from '../copy';

defineProps<{
  allCount: number;
  copy: ReviewCopy;
  pageCount: number;
}>();

const scope = defineModel<'page' | 'all'>({ required: true });
</script>

<template>
  <nav
    class="browse-scope flex-none flex gap-1 p-1.5 border-b border-line bg-bgSurface"
    :aria-label="copy.browseScope"
  >
    <button
      class="browse-scope-option"
      type="button"
      :aria-pressed="scope === 'page'"
      @click="scope = 'page'"
    >
      <span>{{ copy.currentPageScope }}</span>
      <span class="browse-count">{{ pageCount }}</span>
    </button>
    <button
      class="browse-scope-option"
      type="button"
      :aria-pressed="scope === 'all'"
      @click="scope = 'all'"
    >
      <span>{{ copy.allExtractedScope }}</span>
      <span class="browse-count">{{ allCount }}</span>
    </button>
  </nav>
</template>
