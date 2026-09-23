<script setup lang="ts">
import type { ReviewCopy } from '@ai-i18n/core/review-i18n';

defineProps<{
  copy: ReviewCopy;
  error: string;
  refreshing: boolean;
}>();
</script>

<template>
  <p
    v-if="error || refreshing"
    role="status"
    class="m-0 px-4 py-2 text-sm text-textMuted"
  >
    {{ error ? copy.catalogStale : copy.catalogRefreshing }}
  </p>
</template>
