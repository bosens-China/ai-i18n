import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

// 通用翻译规则共用一套跨文件解析 fixture。
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-eslint-'));
export const sourceRoot = path.join(fixtureRoot, 'src');
fs.mkdirSync(sourceRoot, { recursive: true });
export const tsconfigPath = path.join(fixtureRoot, 'tsconfig.json');
fs.writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
    include: ['src/**/*.ts', 'src/**/*.vue'],
  }),
);
fs.writeFileSync(
  path.join(sourceRoot, 'texts.ts'),
  [
    "export const SAVE = '保存'",
    "export const MARKUP = '<strong>保存</strong>'",
    "export const MESSAGES = { save: '保存', states: ['等待', '完成'] }",
    "export const MARKED = defineI18nMessages({ save: '保存', states: ['等待', '完成'] })",
    'export const DYNAMIC = getText()',
  ].join('\n'),
);
fs.writeFileSync(
  path.join(sourceRoot, 'bridge.ts'),
  "export { t } from 'virtual:ai-i18n'",
);
fs.writeFileSync(
  path.join(sourceRoot, 'vue-types.ts'),
  [
    'export interface ImportedProps { label: string }',
    'export interface ImportedEmits { save: [value: string] }',
  ].join('\n'),
);

export const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

export const vueTester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    parserOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

export const dynamicArgumentMessage = diagnosticMessage(
  '翻译调用的参数无法静态提取。source 请使用静态字符串，options 请使用只包含 comment 的静态对象。',
  'The translation-call arguments cannot be statically extracted. Use a static string for source and a static object containing only comment for options.',
);
