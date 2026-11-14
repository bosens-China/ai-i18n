import type { AiI18nFramework } from './framework.js';
import path from 'node:path';
import { localeLoadersCode } from './locale-loading.js';
import type { NormalizedAiI18nOptions } from './project-state.js';

const FILE_BASE_MARKER = '__AI_I18N_FILE_BASE__';

export function resolveRepositoryFileBase(
  code: string,
  chunkFileName: string,
): string {
  if (!code.includes(FILE_BASE_MARKER)) return code;
  const relative = path.posix.relative(
    path.posix.dirname(chunkFileName),
    'locales/files',
  );
  const url = `${relative.startsWith('.') ? relative : `./${relative}`}/`;
  return code.replace(
    JSON.stringify(FILE_BASE_MARKER),
    `new URL(${JSON.stringify(url)}, import.meta.url).href`,
  );
}

export function repositoryRuntimeCode(
  options: NormalizedAiI18nOptions,
  framework: AiI18nFramework,
  build: boolean,
  base: string,
): string {
  const adapter =
    framework === 'vue'
      ? `import { createVueI18nAdapter } from '@ai-i18n/vite/vue';`
      : framework === 'react'
        ? `import { createReactI18n } from '@ai-i18n/vite/react';`
        : '';
  const publicApi =
    framework === 'vue'
      ? `export const { t, useI18n, tRef, i18nComputed, tComputed } = createVueI18nAdapter(facade);`
      : framework === 'react'
        ? `export const t = facade.t;
export const useI18n = createReactI18n(facade);`
        : `export const t = facade.t;`;
  const scopedApi =
    framework === 'vue'
      ? `createVueI18nAdapter(facade, scopedT)`
      : framework === 'react'
        ? `{ t: scopedT, useI18n: createReactI18n(facade, scopedT) }`
        : `{ t: scopedT }`;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const fileBase =
    build && (base === './' || base === '')
      ? JSON.stringify(FILE_BASE_MARKER)
      : JSON.stringify(
          `${normalizedBase}${build ? 'locales/files/' : '@ai-i18n/files/'}`,
        );
  return `
import { createI18nRuntime, createRepositoryScopedTranslate, formatTemplateMessage } from '@ai-i18n/vite/runtime';
${adapter}
const sourceLang = ${JSON.stringify(options.sourceLang)};
const rawLoaders = ${localeLoadersCode(options, build, base)};
const globalMessages = new Map();
const filePacks = new Map();
const activeGroups = new Set();
const scopedApis = new Map();
const fileBase = ${fileBase};
const localeLoaders = Object.fromEntries(Object.entries(rawLoaders).map(([locale, load]) => [locale, async () => {
  const values = await load();
  globalMessages.set(locale, values);
  return mergeLocale(locale);
}]));
function mergeLocale(locale) {
  const values = { ...globalMessages.get(locale) };
  for (const group of activeGroups) Object.assign(values, filePacks.get(locale)?.get(group));
  return values;
}
const runtime = createI18nRuntime({ ...${JSON.stringify(options)}, localeLoaders });
await runtime.ready;
let manifestPromise;
function manifest() {
  return manifestPromise ??= fetch(fileBase + 'manifest.json').then((response) => {
    ${build ? '' : 'if (response.status === 404) return {};'}
    if (!response.ok) throw new Error('ai-i18n file manifest: ' + response.status);
    return response.json();
  });
}
async function loadGroup(group, locale) {
  if (locale === sourceLang) return;
  let packs = filePacks.get(locale);
  if (!packs) filePacks.set(locale, packs = new Map());
  if (packs.has(group)) return;
  const response = await fetch(fileBase + encodeURIComponent(locale) + '/' + group + '.json');
  ${build ? '' : 'if (response.status === 404) return;'}
  if (!response.ok) throw new Error('ai-i18n file packet: ' + response.status);
  packs.set(group, await response.json());
  if (runtime.getLang() === locale && globalMessages.has(locale)) runtime.replaceLocale(locale, mergeLocale(locale));
}
let languageRequest = 0;
let requestedLang = runtime.getLang();
async function changeLang(locale) {
  const request = ++languageRequest;
  requestedLang = locale;
  await Promise.all([...activeGroups].map((group) => loadGroup(group, locale)));
  if (request !== languageRequest) return;
  await runtime.setLang(locale);
  if (request !== languageRequest) return;
  await Promise.all([...activeGroups].map((group) => loadGroup(group, locale)));
}
const facade = { ...runtime, setLang: changeLang };
${publicApi}
export const setLang = changeLang;
export const getLang = runtime.getLang;
export const getLangs = runtime.getLangs;
export const getLangLoadState = runtime.getLangLoadState;
export const subscribe = runtime.subscribe;
export const __loadFile = async (fileId) => {
  const group = (await manifest())[fileId];
  if (!group) return;
  activeGroups.add(group);
  await Promise.all([loadGroup(group, runtime.getLang()), loadGroup(group, requestedLang)]);
};
export const __scope = (fileId) => {
  const current = scopedApis.get(fileId);
  if (current) return current;
  const scopedT = createRepositoryScopedTranslate(runtime, fileId);
  const scoped = ${scopedApi};
  scopedApis.set(fileId, scoped);
  return scoped;
};
export const __translate = (_moduleId, messageId, source) => formatTemplateMessage(runtime.translate(messageId, source), []);
export const __registerModule = () => {};
export const __unregisterModule = () => {};
`;
}
