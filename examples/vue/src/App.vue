<script setup lang="ts">
import { shallowRef } from 'vue';
import CompositionPanel from './components/CompositionPanel.vue';
import OptionsPanel from './components/OptionsPanel.vue';

const tabs = [
  {
    id: 'setup',
    label: 'Setup + lang="ts"',
    hint: 'Composition API',
  },
  {
    id: 'options',
    label: 'Pure Options',
    hint: 'Options API',
  },
] as const;
type DemoTab = (typeof tabs)[number]['id'];

const activeTab = shallowRef<DemoTab>('setup');

function selectTab(tab: DemoTab): void {
  activeTab.value = tab;
}

function handleTabKeydown(event: KeyboardEvent, currentIndex: number): void {
  const lastIndex = tabs.length - 1;
  let nextIndex: number | undefined;

  if (event.key === 'ArrowLeft') {
    nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
  } else if (event.key === 'ArrowRight') {
    nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = lastIndex;
  }

  if (nextIndex === undefined) return;

  event.preventDefault();
  selectTab(tabs[nextIndex].id);
  const tabList = (event.currentTarget as HTMLElement).parentElement;
  tabList
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    .item(nextIndex)
    .focus();
}
</script>

<template>
  <main class="demo-app">
    <header class="demo-hero">
      <div class="brand-mark" aria-hidden="true">AI</div>
      <div>
        <p class="demo-eyebrow">ai-i18n · Vue 3</p>
        <h1>{{ t('同一个 Runtime，两种 Vue 写法') }}</h1>
        <p class="demo-intro">
          {{
            t('在同一页面对照 Composition API 与纯 Options API 的响应式能力。')
          }}
        </p>
      </div>
    </header>

    <aside class="runtime-bridge">
      <span class="runtime-bridge__pulse" aria-hidden="true"></span>
      <strong data-testid="shared-runtime-label">{{
        t('共享 Runtime')
      }}</strong>
      <span>{{ t('切换任一面板，另一侧同步更新。') }}</span>
    </aside>

    <section class="api-workbench" aria-label="Vue API examples">
      <div class="demo-tabs" role="tablist" aria-label="Vue component styles">
        <button
          v-for="(tab, index) in tabs"
          :id="`demo-tab-${tab.id}`"
          :key="tab.id"
          class="demo-tab"
          :data-mode="tab.id"
          :aria-controls="`demo-panel-${tab.id}`"
          :aria-selected="activeTab === tab.id"
          role="tab"
          type="button"
          :tabindex="activeTab === tab.id ? 0 : -1"
          @click="selectTab(tab.id)"
          @keydown="handleTabKeydown($event, index)"
        >
          <span>{{ tab.label }}</span>
          <small>{{ tab.hint }}</small>
        </button>
      </div>

      <section
        id="demo-panel-setup"
        class="demo-tab-panel"
        aria-labelledby="demo-tab-setup"
        role="tabpanel"
        tabindex="0"
        v-show="activeTab === 'setup'"
      >
        <CompositionPanel />
      </section>

      <section
        id="demo-panel-options"
        class="demo-tab-panel"
        aria-labelledby="demo-tab-options"
        role="tabpanel"
        tabindex="0"
        v-show="activeTab === 'options'"
      >
        <OptionsPanel />
      </section>
    </section>
  </main>
</template>
