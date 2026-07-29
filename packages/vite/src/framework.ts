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
    ? documentedDeclaration(
        'useI18n',
        `export const useI18n: import('@ai-i18n/vite/${adapterFramework}').UseI18n;`,
        '  ',
        framework,
      )
    : '';
  const vueRef =
    framework === 'vue'
      ? documentedDeclaration(
          'tRef',
          `export const tRef: import('@ai-i18n/vite/vue').TranslateRef;`,
          '  ',
        )
      : '';
  const globals = autoImport
    ? AUTO_IMPORTS[framework]
        .map((name) => {
          if (name === 'useI18n') {
            return documentedDeclaration(
              name,
              `declare const useI18n: import('@ai-i18n/vite/${adapterFramework}').UseI18n;`,
              '',
              framework,
            );
          }
          if (name === 'tRef') {
            return documentedDeclaration(
              name,
              `declare const tRef: import('@ai-i18n/vite/vue').TranslateRef;`,
            );
          }
          return documentedDeclaration(
            name,
            `declare const ${name}: import('@ai-i18n/vite').I18nRuntime['${name}'];`,
          );
        })
        .join('\n\n')
    : '';
  const macro = documentedDeclaration(
    'defineI18nMessages',
    'declare const defineI18nMessages: <T>(messages: T) => T;',
  );

  const virtualModule = `declare module 'virtual:ai-i18n' {
  import type { I18nRuntime } from '@ai-i18n/vite';

${RUNTIME_API_NAMES.map((name) =>
  documentedDeclaration(
    name,
    `export const ${name}: I18nRuntime['${name}'];`,
    '  ',
  ),
).join(
  '\n\n',
)}${adapter ? `\n\n${adapter}` : ''}${vueRef ? `\n\n${vueRef}` : ''}
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

const RUNTIME_API_NAMES = [
  't',
  'setLang',
  'getLang',
  'getLangs',
  'getLangLoadState',
  'subscribe',
] as const;

function documentedDeclaration(
  name: string,
  declaration: string,
  indent = '',
  framework?: AiI18nFramework,
): string {
  const lines =
    name === 'useI18n'
      ? useI18nDocumentation(framework)
      : API_DOCUMENTATION[name];
  if (!lines) return `${indent}${declaration}`;
  return [
    `${indent}/**`,
    ...lines.map((line) => `${indent} * ${line}`),
    `${indent} */`,
    `${indent}${declaration}`,
  ].join('\n');
}

function useI18nDocumentation(framework?: AiI18nFramework): readonly string[] {
  return framework === 'react'
    ? [
        'React Hook：订阅语言和翻译更新，并返回响应式翻译 API。',
        'React Hook: subscribes to language and translation updates and returns reactive translation APIs.',
        '@returns t、setLang、currentLang、langs 与语言加载状态。',
      ]
    : [
        'Vue composable：订阅语言和翻译更新，并返回响应式翻译 API。',
        'Vue composable: subscribes to language and translation updates and returns reactive translation APIs.',
        '@returns t、setLang，以及 currentLang、langs 和语言加载状态的只读 Ref。',
      ];
}

const API_DOCUMENTATION: Readonly<
  Record<string, readonly string[] | undefined>
> = {
  t: [
    '翻译可静态提取的文案；目标译文缺失时回退到源文案。',
    'Translates a statically extractable message and falls back to the source when missing.',
    '支持 t("保存")、t(messages) 和标签模板 t`你好 ${name}`。',
  ],
  setLang: [
    '切换当前语言；按需加载启用时会等待目标语言 chunk。',
    'Switches the current language and waits for its chunk when lazy loading is enabled.',
    '@returns 切换完成后的 Promise；加载失败时 reject，并保留原语言。',
  ],
  getLang: ['读取当前语言标识。', 'Returns the current language identifier.'],
  getLangs: [
    '读取配置中的语言选项，只读且保持配置顺序。',
    'Returns the configured readonly language options in configuration order.',
  ],
  getLangLoadState: [
    '读取语言加载状态：idle、loading 或 error。',
    'Returns the language loading state: idle, loading, or error.',
  ],
  subscribe: [
    '订阅语言、加载状态和翻译模块更新。',
    'Subscribes to language, loading-state, and translation-module updates.',
    '@returns 取消订阅函数。',
  ],
  tRef: [
    'Vue 专用：把文案或文案树转换为随语言更新的只读 ComputedRef。',
    'Vue only: converts a message or message tree into a readonly ComputedRef that follows language changes.',
    '请在 setup 中创建；模板中直接读取返回值，不要在模板中调用 tRef()。',
  ],
  defineI18nMessages: [
    '编译宏：标记可静态提取的文案对象或数组，无需 import。',
    'Compile-time macro: marks a statically extractable message object or array; no import is needed.',
    '构建时调用会被消除，类型上原样返回 T，不能当作运行时值引用。',
  ],
};
