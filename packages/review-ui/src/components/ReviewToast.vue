<script setup lang="ts">
defineProps<{
  toast: { message: string; error: boolean } | null;
}>();
</script>

<template>
  <div
    v-if="toast"
    class="absolute z-30 right-6 bottom-6 max-w-[420px] px-4.5 py-3 rounded-xl border border-line bg-bgOverlay text-ink shadow-2xl text-sm leading-snug"
    :class="{
      'border-statusRed/40 bg-statusRedBg text-statusRed': toast.error,
    }"
    role="status"
  >
    {{ toast.message }}
  </div>
</template>
