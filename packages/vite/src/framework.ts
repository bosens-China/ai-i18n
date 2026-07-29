import fs from 'node:fs/promises';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { analyzeVueSource } from '@ai-i18n/analyzer/vue';
import type { Plugin } from 'vite';
import type { SourceExtraction, TranslationHookBinding } from './extractor.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

export type AiI18nFramework = 'vanilla' | 'vue' | 'react';

const PLAIN_SOURCE_RE = /\.[cm]?[jt]s$/;
const JSX_SOURCE_RE = /\.[jt]sx$/;
const AUTO_IMPORTS: Record<AiI18nFramework, readonly string[]> = {
  vanilla: [
    't',
    'setLang',
    'getLang',
    'getLangs',
    'getLangLoadState',
    'subscribe',
  ],
  vue: ['useI18n', 't', 'tRef'],
  react: ['useI18n', 't'],
};

export function resolveFramework(
  plugins: readonly Plugin[],
  configured?: AiI18nFramework,
): AiI18nFramework {
  // configResolved 提供最终插件名，避免要求用户重复声明宿主框架。
  const names = plugins.map((plugin) => plugin.name);
  const hasVue = names.some(
    (name) => name === 'vite:vue' || name === 'vite:vue-jsx',
  );
  const hasReact = names.some((name) => name.startsWith('vite:react'));

  if (hasVue && hasReact) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 同一次构建不能同时使用 Vue 和 React 的 Vite 插件。',
        '[ai-i18n] Vue and React Vite plugins cannot be used in the same build.',
      ),
    );
  }

  const detected: AiI18nFramework = hasVue
    ? 'vue'
    : hasReact
      ? 'react'
      : 'vanilla';
  return configured ?? detected;
}

export function frameworkAutoImports(
  framework: AiI18nFramework,
): readonly string[] {
  return AUTO_IMPORTS[framework];
}

export function frameworkTranslationHooks(
  framework: AiI18nFramework,
  autoImport: boolean,
): readonly TranslationHookBinding[] {
  return framework === 'vanilla'
    ? []
    : [
        {
          module: AI_I18N_VIRTUAL_MODULE_ID,
          hook: 'useI18n',
          property: 't',
          autoImport,
        },
      ];
}

export async function extractFrameworkSource(
  source: string,
  id: string,
  framework: AiI18nFramework,
): Promise<SourceExtraction | null | undefined> {
  const filename = id.split('?')[0]!;
  if (!supportsSource(filename, framework)) return null;
  if (!filename.endsWith('.vue')) return undefined;

  // Vue 的 Node 入口会注册宿主 TypeScript，支持解析宏中引用的外部类型。
  const { compileScript, parse } = await import('vue/compiler-sfc');
  const analysis = analyzeVueSource(source, id, { parse, compileScript });
  return {
    analysisCode: analysis.code,
    analysisLang: analysis.lang,
    mapLocation: analysis.mapLocation,
    registration: analysis.registration,
    macroCalls: analysis.macroCalls,
  };
}

export async function writeFrameworkTypes(
  root: string,
  framework: AiI18nFramework,
  autoImport: boolean,
  dts: string | false = 'src/ai-i18n.d.ts',
): Promise<void> {
  if (dts === false) return;
  const filename = path.resolve(root, dts);
  const content = frameworkTypes(framework, autoImport);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  let current: string | undefined;
  try {
    current = await fs.readFile(filename, 'utf8');
  } catch {
    // 首次运行时声明文件尚不存在。
  }
  if (current !== content) await fs.writeFile(filename, content);
}

function supportsSource(filename: string, framework: AiI18nFramework): boolean {
  if (PLAIN_SOURCE_RE.test(filename)) return true;
  if (framework === 'vanilla') return false;
  if (JSX_SOURCE_RE.test(filename)) return true;
  return framework === 'vue' && filename.endsWith('.vue');
}

function frameworkTypes(
  framework: AiI18nFramework,
  autoImport: boolean,
): string {
  const adapterFramework = framework === 'vanilla' ? undefined : framework;
  const adapter = adapterFramework
    ? `  export const useI18n: import('@ai-i18n/vite/${adapterFramework}').UseI18n;`
    : '';
  const vueRef =
    framework === 'vue'
      ? `  export const tRef: import('@ai-i18n/vite/vue').TranslateRef;`
      : '';
  const globals = autoImport
    ? AUTO_IMPORTS[framework]
        .map((name) => {
          if (name === 'useI18n') {
            return `declare const useI18n: import('@ai-i18n/vite/${adapterFramework}').UseI18n;`;
          }
          if (name === 'tRef') {
            return `declare const tRef: import('@ai-i18n/vite/vue').TranslateRef;`;
          }
          return `declare const ${name}: import('@ai-i18n/vite').I18nRuntime['${name}'];`;
        })
        .join('\n')
    : '';
  const macro = 'declare const defineI18nMessages: <T>(messages: T) => T;';

  const virtualModule = `declare module 'virtual:ai-i18n' {
  import type { I18nRuntime } from '@ai-i18n/vite';

  export const t: I18nRuntime['t'];
  export const setLang: I18nRuntime['setLang'];
  export const getLang: I18nRuntime['getLang'];
  export const getLangs: I18nRuntime['getLangs'];
  export const getLangLoadState: I18nRuntime['getLangLoadState'];
  export const subscribe: I18nRuntime['subscribe'];${adapter ? `\n${adapter}` : ''}${vueRef ? `\n${vueRef}` : ''}
}`;

  return `/**
 * @generated by @ai-i18n/vite. Do not edit.
 * @noformat
 */
/* eslint-disable */
// @ts-nocheck

${virtualModule}

${macro}${globals ? `\n${globals}` : ''}
`;
}
