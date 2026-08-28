import { describe, expect, it } from 'vitest';
import MagicString from 'magic-string';
import { compileScript, parse } from '@vue/compiler-sfc';
import { instrumentTranslationOccurrences } from '../src/occurrence-instrumentation';
import { options, setupPlugin } from './plugin-test-utils';

describe('translation occurrence instrumentation', () => {
  it('distinguishes identical calls on the same line by column', () => {
    const source = 'const a = t("保存"); const b = t("保存");';
    const transformed = new MagicString(source);

    instrumentTranslationOccurrences(transformed, source, [
      { line: 1, column: 10 },
      { line: 1, column: 29 },
    ]);

    expect(transformed.toString()).toBe(
      'const a = t.__aiI18nAt(`1:10`)("保存"); const b = t.__aiI18nAt(`1:29`)("保存");',
    );
  });

  it('supports member calls, tagged templates, comments, and optional calls', () => {
    const source = [
      'i18n.t /* keep */ ("保存")',
      't`你好 ${name}`',
      't?.("可选")',
    ].join('\n');
    const transformed = new MagicString(source);

    instrumentTranslationOccurrences(transformed, source, [
      { line: 1, column: 0 },
      { line: 2, column: 0 },
      { line: 3, column: 0 },
    ]);

    expect(transformed.toString()).toBe(
      [
        'i18n.t /* keep */ .__aiI18nAt(`1:0`)("保存")',
        't.__aiI18nAt(`2:0`)`你好 ${name}`',
        't.__aiI18nAt(`3:0`)?.("可选")',
      ].join('\n'),
    );
  });

  it('instruments same-line calls through the complete Vanilla transform', async () => {
    const { transform } = setupPlugin([], undefined, {
      ...options,
      autoImport: true,
    });
    const result = await transform(
      'const a = t("保存"); const b = t("保存")',
      '/workspace/src/actions.ts',
    );

    expect(result?.code).toContain('t.__aiI18nAt(`1:10`)("保存")');
    expect(result?.code).toContain('t.__aiI18nAt(`1:29`)("保存")');
  });

  it('keeps distinct script and template positions through the Vue transform', async () => {
    const source = `<script setup>
const a = t("保存"); const b = t("保存")
</script>
<template><span>{{ t("保存") }}</span><span>{{ t("保存") }}</span></template>`;
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );
    const result = await transform(source, '/workspace/src/Actions.vue');

    expect(result?.code.match(/__aiI18nAt\(`\d+:\d+`\)/g)).toEqual([
      '__aiI18nAt(`2:10`)',
      '__aiI18nAt(`2:29`)',
      '__aiI18nAt(`4:19`)',
      '__aiI18nAt(`4:45`)',
    ]);
  });

  it.each([
    [
      'double-quoted',
      `<template><el-empty :description="t('暂无可用电站')" /></template>`,
    ],
    [
      'single-quoted',
      `<template><el-empty :description='t("暂无可用电站")' /></template>`,
    ],
    [
      'template-literal',
      '<template><el-empty :description="t`暂无可用电站`" /></template>',
    ],
  ])('keeps %s Vue bound attributes compilable', async (_, source) => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:vue' }],
    );
    const result = await transform(source, '/workspace/src/EmptyState.vue');
    const parsed = parse(result!.code, { filename: 'EmptyState.vue' });

    expect(result?.code).toMatch(/t\.__aiI18nAt\(`1:\d+`\)/);
    expect(parsed.errors).toEqual([]);
    expect(() =>
      compileScript(parsed.descriptor, {
        id: 'vue-bound-attribute-occurrence',
        inlineTemplate: true,
      }),
    ).not.toThrow();
  });
});
