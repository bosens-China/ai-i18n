import type { ModuleMessages } from '@ai-i18n/core';
import type { AiI18nFramework } from './framework.js';
import type { NormalizedAiI18nOptions } from './project-state.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';
import { repositoryRuntimeCode } from './repository-runtime-code.js';

export function runtimeCode(
  options: NormalizedAiI18nOptions,
  framework: AiI18nFramework,
  build = false,
  base = '/',
): string {
  return repositoryRuntimeCode(options, framework, build, base);
}

export function scopedRuntimeCode(
  moduleId: string,
  framework: AiI18nFramework,
  repository?: { fileId: string; loadFile: boolean },
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
  ${repository ? '__loadFile,' : ''}
  __translate as translate,
  __unregisterModule,
  getLang,
  getLangLoadState,
  getLangs,
  setLang,
  subscribe,
} from ${JSON.stringify(AI_I18N_VIRTUAL_MODULE_ID)};
const moduleId = ${JSON.stringify(moduleId)};
${repository?.loadFile ? `await __loadFile(${JSON.stringify(repository.fileId)});` : ''}
const scoped = __scope(${JSON.stringify(repository?.fileId ?? moduleId)});
export const t = scoped.t;
export { __registerModule, __unregisterModule, getLang, getLangLoadState, getLangs, setLang, subscribe };
export const __translate = (messageId, source, occurrence) => translate(moduleId, messageId, source, occurrence);${frameworkExports}
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
runtimeT.__aiI18nAt = () => runtimeT;
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
  messages: ModuleMessages | string,
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
