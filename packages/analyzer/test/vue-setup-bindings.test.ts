import { compileScript, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
import { findOrdinarySetupTranslations } from '../src/vue-setup-bindings';

describe('ordinary Vue setup bindings', () => {
  it.each([
    [
      'mutated hook object',
      `const api = useI18n()
       const alias = api
       alias.t = (value) => value
       return { api }`,
    ],
    [
      'ambiguous spread return',
      `const { t } = useI18n()
       const local = { t: (value) => value }
       return { t, ...local }`,
    ],
  ])('rejects %s', (_, setupBody) => {
    const source = `<script>
export default { setup() { ${setupBody} } }
</script>`;
    const descriptor = parse(source, { filename: 'Component.vue' }).descriptor;
    const compiled = compileScript(descriptor, { id: 'component' });

    expect(findOrdinarySetupTranslations(compiled.scriptAst ?? [])).toEqual(
      new Map(),
    );
  });
});
