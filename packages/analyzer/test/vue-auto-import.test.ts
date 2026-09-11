import { describe, expect, it, vi } from 'vitest';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { analyzeVueSource } from '../src/vue';

const source = `<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';
const { t } = useI18n();
const label = t('你好');
</script>
<template><p>{{ label }} {{ t('欢迎') }}</p></template>`;

describe('Vue analysis without auto imports', () => {
  it('skips the extra compilation while preserving message code and source locations', () => {
    const compile = vi.fn(compileScript);
    const compiler = { parse, compileScript: compile, compileTemplate };
    const normal = analyzeVueSource(source, '/App.vue', compiler);
    expect(compile).toHaveBeenCalledTimes(2);
    compile.mockClear();
    const explicit = analyzeVueSource(source, '/App.vue', compiler, {
      autoImport: false,
    });
    expect(compile).toHaveBeenCalledTimes(1);
    expect(explicit.autoImportCode).toBe('');
    expect(normal.autoImportCode).not.toBe('');
    expect(explicit.code).toBe(normal.code);
    expect(explicit.registration).toEqual(normal.registration);
    expect(explicit.runtimeImports).toEqual(normal.runtimeImports);
    expect(explicit.macroCalls).toEqual(normal.macroCalls);
    for (const value of ['你好', '欢迎']) {
      const prefix = explicit.code
        .slice(0, explicit.code.indexOf(value))
        .split('\n');
      const location = { line: prefix.length, column: prefix.at(-1)!.length };
      expect(explicit.mapLocation(location)).toEqual(
        normal.mapLocation(location),
      );
    }
  });

  it('still rejects malformed source when auto imports are disabled', () => {
    expect(() =>
      analyzeVueSource(
        '<script setup>const =</script>',
        '/Bad.vue',
        { parse, compileScript, compileTemplate },
        { autoImport: false },
      ),
    ).toThrow();
  });
});
