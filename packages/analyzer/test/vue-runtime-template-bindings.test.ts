import { compileScript, parse } from '@vue/compiler-sfc';
import { describe, expect, it } from 'vitest';
import { findVueTemplateRuntimeBinding } from '../src/vue-runtime-template-bindings';

describe('Vue Options template runtime bindings', () => {
  it('uses the Runtime auto import without requiring a methods bridge', () => {
    const script = `import { defineComponent } from 'vue'
      export default defineComponent({
        computed: {
          label() { return t('Options computed') },
        },
      })`;

    expect(findVueTemplateRuntimeBinding([compile(script)])).toBe(
      'auto-import',
    );
  });

  it('requires an Options methods bridge for an explicit Runtime import', () => {
    const script = `import { t } from 'virtual:ai-i18n'
      export default {
        computed: {
          label() { return t('Options computed') },
        },
      }`;

    expect(findVueTemplateRuntimeBinding([compile(script)])).toBeNull();
  });

  it('keeps an explicit script-setup import available to the template', () => {
    const descriptor = parse(
      `<script setup>import { t } from 'virtual:ai-i18n'</script>`,
      { filename: 'Setup.vue' },
    ).descriptor;
    const compiled = compileScript(descriptor, { id: 'setup' });

    expect(
      findVueTemplateRuntimeBinding([
        compiled.scriptAst ?? [],
        compiled.scriptSetupAst ?? [],
      ]),
    ).toBe('explicit-import');
  });

  it('recognizes a bare defineComponent supplied by community auto import', () => {
    const script = `export default defineComponent({
      computed: {
        label() { return t('Options computed') },
      },
    })`;

    expect(findVueTemplateRuntimeBinding([compile(script)])).toBe(
      'auto-import',
    );
  });

  it.each([
    [
      'a named Runtime import',
      `import { i18nComputed } from 'virtual:ai-i18n'
       export default {
         computed: {
           ...i18nComputed(),
           translated: tComputed('Options translated'),
         },
       }`,
    ],
    [
      'an aliased Runtime import',
      `import { i18nComputed as runtimeComputed } from 'virtual:ai-i18n'
       export default defineComponent({
         computed: {
           ...runtimeComputed(),
           translated: tComputed('Options translated'),
         },
       })`,
    ],
    [
      'an unbound auto import',
      `export default defineComponent({
         computed: {
           ...i18nComputed(),
           translated: tComputed('Options translated'),
         },
       })`,
    ],
  ])('keeps template t available beside %s', (_, script) => {
    expect(findVueTemplateRuntimeBinding([compile(script)])).toBe(
      'auto-import',
    );
  });

  it.each([
    [
      'a named runtime import',
      `import { t } from 'virtual:ai-i18n'
       export default { methods: { t } }`,
      { kind: 'component-method', local: 't' },
    ],
    [
      'an aliased runtime import',
      `import { t as translateWithLongName } from 'virtual:ai-i18n'
       export default { methods: { t: translateWithLongName } }`,
      { kind: 'component-method', local: 'translateWithLongName' },
    ],
    [
      'an unbound auto import',
      `export default { methods: { t } }`,
      { kind: 'component-method', local: 't' },
    ],
    [
      'an unbound auto import in a bare defineComponent',
      `export default defineComponent({ methods: { t } })`,
      { kind: 'component-method', local: 't' },
    ],
  ])('recognizes %s exposed through methods', (_, script, expected) => {
    expect(findVueTemplateRuntimeBinding([compile(script)])).toEqual(expected);
  });

  it.each([
    [
      'a local shorthand',
      `const t = (value) => value
       export default { methods: { t } }`,
    ],
    [
      'a method declaration',
      `export default { methods: { t(value) { return value } } }`,
    ],
    [
      'a method declaration in a bare defineComponent',
      `export default defineComponent({
        methods: { t(value) { return value } },
      })`,
    ],
    [
      'a local method value',
      `const translate = (value) => value
       export default { methods: { t: translate } }`,
    ],
    [
      'another runtime import',
      `import { t } from 'another-i18n'
       export default { methods: { t } }`,
    ],
    [
      'a root spread before methods',
      `const extra = {}
       export default { ...extra, methods: { t } }`,
    ],
    [
      'a root spread after methods',
      `const extra = {}
       export default { methods: { t }, ...extra }`,
    ],
  ])('keeps %s shadowed', (_, script) => {
    expect(findVueTemplateRuntimeBinding([compile(script)])).toBeNull();
  });

  it.each([
    [
      'an identifier default export',
      `const options = {}; export default options`,
    ],
    [
      'a named default export',
      `const options = {}; export { options as default }`,
    ],
    [
      'a dynamic defineComponent argument',
      `const options = {}; export default defineComponent(options)`,
    ],
    ['an unknown component factory', `export default createComponent({})`],
    [
      'a locally declared defineComponent',
      `const defineComponent = (options) => options
       export default defineComponent({})`,
    ],
    [
      'defineComponent imported from another package',
      `import { defineComponent } from 'another-framework'
       export default defineComponent({})`,
    ],
  ])('keeps %s ambiguous', (_, script) => {
    expect(findVueTemplateRuntimeBinding([compile(script)])).toBeNull();
  });

  it.each([
    [
      'a methods spread',
      `const extra = {}; export default { methods: { ...extra } }`,
    ],
    [
      'external computed options',
      `const computed = {}; export default { computed }`,
    ],
    [
      'an unknown computed spread',
      `const extraComputed = {}
       export default { computed: { ...extraComputed } }`,
    ],
    [
      'a shadowed i18nComputed call',
      `const i18nComputed = () => ({ t: () => 'local' })
       export default { computed: { ...i18nComputed() } }`,
    ],
    [
      'i18nComputed imported from another package',
      `import { i18nComputed } from 'another-i18n'
       export default { computed: { ...i18nComputed() } }`,
    ],
    ['external props options', `const props = {}; export default { props }`],
    [
      'a data return spread',
      `const state = {}; export default { data: () => ({ ...state }) }`,
    ],
    [
      'a dynamic setup return',
      `const createBindings = () => ({})
       export default { setup() { return createBindings() } }`,
    ],
  ])('keeps %s conservatively shadowed', (_, script) => {
    expect(findVueTemplateRuntimeBinding([compile(script)])).toBeNull();
  });

  it('keeps an ambiguous Options export shadowed beside script setup', () => {
    const descriptor = parse(
      `<script>
const options = {}
export default options
</script>
<script setup>const ready = true</script>`,
      { filename: 'Mixed.vue' },
    ).descriptor;
    const compiled = compileScript(descriptor, { id: 'mixed' });

    expect(
      findVueTemplateRuntimeBinding([
        compiled.scriptAst ?? [],
        compiled.scriptSetupAst ?? [],
      ]),
    ).toBeNull();
  });
});

function compile(script: string): readonly unknown[] {
  const descriptor = parse(`<script>${script}</script>`, {
    filename: 'Options.vue',
  }).descriptor;
  return compileScript(descriptor, { id: 'options' }).scriptAst ?? [];
}
