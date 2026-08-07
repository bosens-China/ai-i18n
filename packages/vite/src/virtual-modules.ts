import type { ModuleMessages } from '@ai-i18n/core';
import type { AiI18nFramework } from './framework.js';
import { localeLoadersCode } from './locale-loading.js';
import type { NormalizedAiI18nOptions } from './project-state.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

export function runtimeCode(
  options: NormalizedAiI18nOptions,
  translationUpdateEvent: string,
  localeUpdateEvent: string,
  framework: AiI18nFramework,
  build = false,
  base = '/',
): string {
  const adapter =
    framework === 'vanilla'
      ? ''
      : framework === 'vue'
        ? `import { createVueI18nAdapter } from '@ai-i18n/vite/vue';`
        : `import { createReactI18n } from '@ai-i18n/vite/react';`;
  const hook =
    framework === 'vanilla'
      ? ''
      : framework === 'vue'
        ? `export const { t, useI18n, tRef, i18nComputed, tComputed } = createVueI18nAdapter(runtime);`
        : `export const useI18n = createReactI18n(runtime);`;
  const scopedHook =
    framework === 'vanilla'
      ? `return { t };`
      : framework === 'vue'
        ? `return createVueI18nAdapter(runtime, t);`
        : `return { t, useI18n: createReactI18n(runtime, t) };`;
  const runtimeT = framework === 'vue' ? '' : 'export const t = runtime.t;';
  const localeHotUpdate = options.loading
    ? `
  import.meta.hot.on(${JSON.stringify(localeUpdateEvent)}, ({ locale, messages }) => {
    runtime.replaceLocale(locale, messages);
  });`
    : '';
  return `
import { createI18nRuntime, createScopedTranslate, formatTemplateMessage, runtimeMessageId } from '@ai-i18n/vite/runtime';
${adapter}
const runtime = createI18nRuntime({
  ...${JSON.stringify(options)},
  localeLoaders: ${localeLoadersCode(options, build, base)},
});
const activeModules = new Set();
const scopedApis = new Map();
${runtimeT}
export const setLang = runtime.setLang;
export const getLang = runtime.getLang;
export const getLangs = runtime.getLangs;
export const getLangLoadState = runtime.getLangLoadState;
export const subscribe = runtime.subscribe;
export const __translate = (moduleId, messageId, source) =>
  formatTemplateMessage(runtime.translate(runtimeMessageId(moduleId, messageId), source), []);
export const __scope = (moduleId) => {
  const current = scopedApis.get(moduleId);
  if (current) return current;
  const t = createScopedTranslate(runtime, moduleId);
  const scoped = (() => { ${scopedHook} })();
  scopedApis.set(moduleId, scoped);
  return scoped;
};
export const __registerModule = (moduleId, messages) => {
  activeModules.add(moduleId);
  runtime.registerModule(moduleId, messages);
};
export const __unregisterModule = (moduleId) => {
  activeModules.delete(moduleId);
  runtime.unregisterModule(moduleId);
};
${hook}
if (import.meta.hot) {
  import.meta.hot.on(${JSON.stringify(translationUpdateEvent)}, ({ moduleId, messages }) => {
    if (activeModules.has(moduleId)) runtime.replaceModule(moduleId, messages);
  });
${localeHotUpdate}
}
`;
}

export function scopedRuntimeCode(
  moduleId: string,
  framework: AiI18nFramework,
): string {
  const frameworkExports =
    framework === 'vanilla'
      ? ''
      : framework === 'vue'
        ? `\nexport const useI18n = scoped.useI18n;\nexport const tRef = scoped.tRef;\nexport const i18nComputed = scoped.i18nComputed;\nexport const tComputed = scoped.tComputed;`
        : `\nexport const useI18n = scoped.useI18n;`;
  return `
import {
  __registerModule,
  __scope,
  __translate as translate,
  __unregisterModule,
  getLang,
  getLangLoadState,
  getLangs,
  setLang,
  subscribe,
} from ${JSON.stringify(AI_I18N_VIRTUAL_MODULE_ID)};
const moduleId = ${JSON.stringify(moduleId)};
const scoped = __scope(moduleId);
export const t = scoped.t;
export { __registerModule, __unregisterModule, getLang, getLangLoadState, getLangs, setLang, subscribe };
export const __translate = (messageId, source) => translate(moduleId, messageId, source);${frameworkExports}
`;
}

export function runtimeStubCode(framework: AiI18nFramework): string {
  const adapter =
    framework === 'vanilla'
      ? ''
      : framework === 'vue'
        ? `import { createVueI18nAdapter } from '@ai-i18n/vite/vue';`
        : `import { createReactI18n } from '@ai-i18n/vite/react';`;
  const hook =
    framework === 'vanilla'
      ? ''
      : framework === 'vue'
        ? `const runtime = { t: runtimeT, setLang, getLang, getLangs, getLangLoadState, subscribe };
export const { t, useI18n, tRef, i18nComputed, tComputed } = createVueI18nAdapter(runtime);`
        : `const runtime = { t: runtimeT, setLang, getLang, getLangs, getLangLoadState, subscribe };
export const useI18n = createReactI18n(runtime);`;
  const exportedT = framework === 'vue' ? '' : 'export const t = runtimeT;';
  return `
import { formatTemplateMessage } from '@ai-i18n/vite/runtime';
${adapter}
const runtimeT = (source, ...values) =>
  typeof source === 'string'
    ? source
    : source.reduce((message, part, index) => message + part + (index < values.length ? String(values[index]) : ''), '');
${exportedT}
export const setLang = async () => {};
export const getLang = () => '';
export const getLangs = () => [];
const idleLangLoadState = Object.freeze({ status: 'idle', targetLang: null, error: null });
export const getLangLoadState = () => idleLangLoadState;
export const subscribe = () => () => {};
export const __translate = (messageId, source) =>
  formatTemplateMessage(source, []);
export const __scope = () => ({ t: runtimeT${framework === 'vue' ? ', useI18n, tRef, i18nComputed, tComputed' : framework === 'react' ? ', useI18n' : ''} });
export const __registerModule = () => {};
export const __unregisterModule = () => {};
${hook}
`;
}

export function registerCode(
  moduleId: string,
  messages: ModuleMessages,
): string {
  return `
import { __registerModule, __unregisterModule } from ${JSON.stringify(AI_I18N_VIRTUAL_MODULE_ID)};
const moduleId = ${JSON.stringify(moduleId)};
__registerModule(moduleId, ${JSON.stringify(messages)});
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => __unregisterModule(moduleId));
}
`;
}
