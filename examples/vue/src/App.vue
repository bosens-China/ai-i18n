<script setup lang="ts">
import { t, useI18n } from 'virtual:ai-i18n';
import { shallowRef } from 'vue';
import CompositionPanel from './components/CompositionPanel.vue';
import OptionsPanel from './components/OptionsPanel.vue';

const { currentLang, langs, setLang, isLangLoading, langLoadState } = useI18n();

async function switchLanguage(event: Event): Promise<void> {
  const target = event.currentTarget;
  if (!(target instanceof HTMLSelectElement)) return;
  try {
    await setLang(target.value);
  } catch {
    // Runtime 保留错误状态，页面据此显示提示。
  }
}

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
  <div class="demo-shell">
    <header class="demo-header">
      <a class="demo-brand" href="#top"
        ><span class="demo-brand-mark">F</span
        ><span
          ><strong>Fieldnotes</strong><br /><small>{{ t('行间') }}</small></span
        ></a
      >
      <nav class="demo-nav" :aria-label="t('页面导航')">
        <a href="#stories">{{ t('文章') }}</a>
        <a href="#about">{{ t('关于') }}</a>
        <label
          ><span class="sr-only">{{ t('选择语言') }}</span
          ><select
            class="demo-select"
            :value="currentLang"
            :disabled="isLangLoading"
            @change="switchLanguage"
          >
            <option v-for="lang in langs" :key="lang.value" :value="lang.value">
              {{ lang.label }}
            </option>
          </select></label
        >
      </nav>
    </header>
    <main id="top">
      <p
        v-if="langLoadState.status === 'error'"
        class="error-message"
        role="alert"
      >
        {{ t('语言包加载失败，当前语言保持不变。') }}
      </p>
      <section class="grid items-center gap-10 py-16 sm:py-24 md:grid-cols-2">
        <div>
          <p class="demo-kicker">{{ t('一本关于生活的笔记') }}</p>
          <h1 class="demo-heading mt-5">{{ t('把想法，写成日常。') }}</h1>
          <p class="demo-intro mt-6">
            {{ t('记录那些值得停下来感受的小事，让灵感在日常里慢慢生长。') }}
          </p>
          <a class="demo-button mt-7" href="#stories"
            >{{ t('阅读文章') }} <span aria-hidden="true">↗</span></a
          >
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="hero-art-page">
            FIELD<br />NOTES<i></i><i></i><i></i><b>✳</b>
          </div>
        </div>
      </section>
      <section id="stories" class="border-t border-line pt-10">
        <div class="flex flex-wrap items-end justify-between gap-3 mb-7">
          <div>
            <p class="demo-kicker">{{ t('慢慢读') }}</p>
            <h2 class="demo-section-heading mt-2">{{ t('精选文章') }}</h2>
          </div>
          <p class="text-sm text-muted m-0">{{ t('关于观察、创造与生活') }}</p>
        </div>
        <div class="demo-grid">
          <article class="demo-card">
            <span class="demo-tag">{{ t('生活') }}</span>
            <h3 class="text-xl leading-snug mt-6 mb-3">
              {{ t('给平凡的一天留点空白') }}
            </h3>
            <p class="text-sm text-muted">
              {{ t('不必填满每一分钟，留一点时间给偶然的发现。') }}
            </p>
            <details>
              <summary class="demo-link">{{ t('阅读文章') }}</summary>
              <p class="text-sm">
                {{
                  t(
                    '放下手边的清单，走一段熟悉的路。光影和风会提醒我们，日常也有值得珍藏的时刻。',
                  )
                }}
              </p>
            </details>
          </article>
          <article class="demo-card">
            <span class="demo-tag">{{ t('创造') }}</span>
            <h3 class="text-xl leading-snug mt-6 mb-3">
              {{ t('从一个小想法开始') }}
            </h3>
            <p class="text-sm text-muted">
              {{ t('灵感不必完美，先把它写下来，再慢慢靠近答案。') }}
            </p>
            <details>
              <summary class="demo-link">{{ t('阅读文章') }}</summary>
              <p class="text-sm">
                {{
                  t(
                    '把问题写在纸上，画一条线，记下第一个念头。许多好的作品，都始于这样简单的一步。',
                  )
                }}
              </p>
            </details>
          </article>
          <article class="demo-card">
            <span class="demo-tag">{{ t('观察') }}</span>
            <h3 class="text-xl leading-snug mt-6 mb-3">
              {{ t('学会看见身边的风景') }}
            </h3>
            <p class="text-sm text-muted">
              {{ t('换一个角度，熟悉的街道也会有新的故事。') }}
            </p>
            <details>
              <summary class="demo-link">{{ t('阅读文章') }}</summary>
              <p class="text-sm">
                {{
                  t(
                    '留意窗边的植物、街角的声音，还有人与人之间短暂的问候。细节让世界变得生动。',
                  )
                }}
              </p>
            </details>
          </article>
        </div>
      </section>
      <section id="about" class="mt-16 rounded-2xl bg-wash p-8 sm:p-10">
        <p class="demo-kicker">{{ t('关于行间') }}</p>
        <h2 class="demo-section-heading mt-3">{{ t('为生活留下一点记录') }}</h2>
        <p class="demo-intro mb-0">
          {{
            t('这里收集日常中的观察与思考，愿每一次阅读都带来一点新的视角。')
          }}
        </p>
      </section>
      <details class="mt-12">
        <summary class="demo-link">{{ t('探索 Vue 国际化示例') }}</summary>
        <p class="text-sm text-muted" data-testid="shared-runtime-label">
          {{ t('共享 Runtime') }} · {{ t('切换任一面板，另一侧同步更新。') }}
        </p>
        <section class="api-workbench" aria-label="Vue API examples">
          <div
            class="demo-tabs"
            role="tablist"
            aria-label="Vue component styles"
          >
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
      </details>
    </main>
    <footer class="demo-footer">
      <span>Fieldnotes · {{ t('行间') }}</span
      ><span>{{ t('写给每一个寻常日子') }}</span>
    </footer>
  </div>
</template>
