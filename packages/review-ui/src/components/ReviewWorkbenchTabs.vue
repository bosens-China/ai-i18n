<script setup lang="ts">
import type { ReviewCopy } from '../copy';

/** 顶层 Tab：当前页面 / 全部页面 / 设置 */
export type ReviewWorkbenchTab = 'page' | 'all' | 'settings';

defineProps<{
  allCount: number;
  copy: ReviewCopy;
  pageCount: number;
}>();

const tab = defineModel<ReviewWorkbenchTab>({ required: true });
</script>

<template>
  <nav
    class="review-main-tabs flex flex-none gap-0 border-b border-lineFocus bg-bgSurface px-2"
    :aria-label="copy.workbenchTabsLabel"
  >
    <button
      class="review-tab"
      type="button"
      :aria-selected="tab === 'page'"
      @click="tab = 'page'"
    >
      <span>{{ copy.currentPageScope }}</span>
      <span
        class="review-scope-count ml-1.5 font-mono text-[10px] leading-none font-bold text-dimmed"
        >{{ pageCount }}</span
      >
    </button>
    <button
      class="review-tab"
      type="button"
      :aria-selected="tab === 'all'"
      @click="tab = 'all'"
    >
      <span>{{ copy.allPagesScope }}</span>
      <span
        class="review-scope-count ml-1.5 font-mono text-[10px] leading-none font-bold text-dimmed"
        >{{ allCount }}</span
      >
    </button>
    <button
      class="review-tab ml-auto"
      type="button"
      :aria-selected="tab === 'settings'"
      @click="tab = 'settings'"
    >
      {{ copy.tabSettings }}
    </button>
  </nav>
</template>
