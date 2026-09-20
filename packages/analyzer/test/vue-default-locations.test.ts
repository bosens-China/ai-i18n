import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { expect, it } from 'vitest';
import { analyzeVueSource } from '../src/vue';

function locationOf(source: string, offset: number) {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)!.length };
}

it.each([true, false])(
  'maps copied defaults by property, including duplicate text and reordered props (autoImport=%s)',
  (autoImport) => {
    const source = `<template><button>{{ first }}</button></template>
<script lang="ts">export default { name: 'Defaults' }</script>
<script setup lang="ts">
import { t } from 'virtual:ai-i18n';
withDefaults(defineProps<{ first?: string; second?: string; third?: string[] }>(), {
  second: t('执行'),
  first: t('执行'),
  third() { return [t('方法')]; },
});
const normal = t('普通');
</script>`;
    const result = analyzeVueSource(
      source,
      '/Defaults.vue',
      { parse, compileScript, compileTemplate },
      { autoImport },
    );
    for (const [generatedProperty, originalProperty, text] of [
      ['first:', 'first:', "t('执行')"],
      ['second:', 'second:', "t('执行')"],
      ['third:', 'third()', "t('方法')"],
      ['const normal', 'const normal', "t('普通')"],
    ]) {
      const generated = result.code.indexOf(
        text!,
        result.code.indexOf(generatedProperty!),
      );
      const original = source.indexOf(text!, source.indexOf(originalProperty!));
      expect(generated).toBeGreaterThan(-1);
      expect(result.mapLocation(locationOf(result.code, generated))).toEqual(
        locationOf(source, original),
      );
    }
  },
);
