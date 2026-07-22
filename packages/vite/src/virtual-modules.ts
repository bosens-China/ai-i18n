import type { ModuleMessages } from '@ai-i18n/core';
import type { NormalizedAiI18nOptions } from './project-state.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

export function runtimeCode(
  options: NormalizedAiI18nOptions,
  translationUpdateEvent: string,
): string {
  return `
import { createI18nRuntime } from '@ai-i18n/vite/runtime';
const runtime = createI18nRuntime(${JSON.stringify(options)});
const activeModules = new Set();
export const t = runtime.t;
export const setLang = runtime.setLang;
export const getLang = runtime.getLang;
export const getLangs = runtime.getLangs;
export const subscribe = runtime.subscribe;
export const __translate = runtime.translate;
export const __registerModule = (moduleId, messages) => {
  activeModules.add(moduleId);
  runtime.registerModule(moduleId, messages);
};
export const __unregisterModule = (moduleId) => {
  activeModules.delete(moduleId);
  runtime.unregisterModule(moduleId);
};
if (import.meta.hot) {
  import.meta.hot.on(${JSON.stringify(translationUpdateEvent)}, ({ moduleId, messages }) => {
    if (activeModules.has(moduleId)) runtime.replaceModule(moduleId, messages);
  });
}
`;
}

export function runtimeStubCode(): string {
  return `
export const t = (source) => source;
export const setLang = async () => {};
export const getLang = () => '';
export const getLangs = () => [];
export const subscribe = () => () => {};
export const __translate = (messageId, source) => source;
export const __registerModule = () => {};
export const __unregisterModule = () => {};
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
