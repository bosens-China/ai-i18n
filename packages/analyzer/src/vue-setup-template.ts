import type { NodeOfType } from 'yuku-analyzer';
import { analyzeModule, type AnalysisLanguage } from './index.js';
import {
  findOrdinarySetupTranslations,
  type OrdinarySetupTranslation,
} from './vue-setup-bindings.js';
import type { VueTemplateRuntimeBinding } from './vue-runtime-template-bindings.js';

export interface OrdinarySetupTemplateAnalysis {
  bridgeCode: string;
  runtimeBinding: VueTemplateRuntimeBinding | null;
  templateCode: string;
}

export function createOrdinarySetupTemplateAnalysis(
  scriptCode: string,
  scriptAst: readonly unknown[],
  templateCode: string,
  runtimeBinding: VueTemplateRuntimeBinding | null = null,
): OrdinarySetupTemplateAnalysis | null {
  const bindings = findOrdinarySetupTranslations(scriptAst);
  const module = analyzeModule(templateCode, 'ai-i18n-vue-template.js');
  const replacements: Array<{
    binding: OrdinarySetupTranslation | null;
    end: number;
    exposed: string;
    start: number;
  }> = [];
  module.walk({
    MemberExpression(node) {
      const match = matchTemplateBinding(node, bindings);
      if (match) {
        replacements.push({ ...match, start: node.start, end: node.end });
      } else if (
        runtimeBinding &&
        runtimeMemberName(node, runtimeBinding) === 't'
      ) {
        replacements.push({
          binding: null,
          exposed: 't',
          start: node.start,
          end: node.end,
        });
      }
    },
  });
  if (!replacements.length) return null;

  const bridges = new Map<
    string,
    { binding: OrdinarySetupTranslation | null; name: string }
  >();
  let usesRuntimeT = false;
  let bridgeIndex = 0;
  for (const { binding, exposed } of replacements) {
    if (!binding) {
      usesRuntimeT = true;
      continue;
    }
    if (bridges.has(exposed)) continue;
    let name: string;
    do {
      name = `__a${(bridgeIndex++).toString(36)}`;
    } while (scriptCode.includes(name) || templateCode.includes(name));
    bridges.set(exposed, { binding, name });
  }
  let runtimeName = runtimeBinding ? runtimeBindingName(runtimeBinding) : 't';
  let runtimeBridge = '';
  if (
    usesRuntimeT &&
    runtimeBinding &&
    typeof runtimeBinding !== 'string' &&
    runtimeBinding.local !== 't'
  ) {
    do {
      runtimeName = `__a${(bridgeIndex++).toString(36)}`;
    } while (
      scriptCode.includes(runtimeName) ||
      templateCode.includes(runtimeName)
    );
    runtimeBridge = `import { t as ${runtimeName} } from 'virtual:ai-i18n';`;
  }

  let transformed = templateCode;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    const bridge = replacement.binding
      ? bridges.get(replacement.exposed)!.name
      : runtimeName;
    const length = replacement.end - replacement.start;
    // 等长替换保留 compiler-sfc 生成位置，后续可直接复用模板 source map。
    transformed =
      transformed.slice(0, replacement.start) +
      bridge.padEnd(length, ' ') +
      transformed.slice(replacement.end);
  }

  return {
    bridgeCode: [
      ...[...bridges.values()].map(
        ({ binding, name }) => `const { t: ${name} } = ${binding!.hook}();`,
      ),
      runtimeBridge,
    ]
      .filter(Boolean)
      .join('\n'),
    runtimeBinding: usesRuntimeT ? runtimeBinding : null,
    templateCode: isolateCompiledTemplate(transformed),
  };
}

export function createInlineTemplateRuntimeAnalysis(
  code: string,
  runtimeBinding: VueTemplateRuntimeBinding | null,
  lang: AnalysisLanguage,
): { code: string; runtimeBinding: VueTemplateRuntimeBinding | null } {
  if (!runtimeBinding) return { code, runtimeBinding: null };
  const module = analyzeModule(
    code,
    `ai-i18n-vue-inline-template.${lang}`,
    undefined,
    lang,
  );
  const replacements: Array<{ start: number; end: number }> = [];
  module.walk({
    MemberExpression(node) {
      if (runtimeMemberName(node, runtimeBinding) === 't') {
        replacements.push({ start: node.start, end: node.end });
      }
    },
  });
  if (!replacements.length) return { code, runtimeBinding: null };

  let transformed = code;
  let local = runtimeBindingName(runtimeBinding);
  let bridge = '';
  if (typeof runtimeBinding !== 'string' && runtimeBinding.local !== 't') {
    let index = 0;
    do {
      local = `__a${(index++).toString(36)}`;
    } while (code.includes(local));
    bridge = `\nimport { t as ${local} } from 'virtual:ai-i18n';`;
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    const length = replacement.end - replacement.start;
    transformed =
      transformed.slice(0, replacement.start) +
      local.padEnd(length, ' ') +
      transformed.slice(replacement.end);
  }
  return {
    code: transformed + bridge,
    runtimeBinding,
  };
}

function runtimeBindingName(binding: VueTemplateRuntimeBinding): string {
  return typeof binding === 'string' ? 't' : binding.local;
}

function runtimeMemberName(
  member: NodeOfType<'MemberExpression'>,
  binding: VueTemplateRuntimeBinding,
): string | null {
  if (member.object.type !== 'Identifier') return null;
  const owner = member.object.name;
  const isComponentMethod =
    typeof binding !== 'string' && binding.kind === 'component-method';
  if (
    owner !== '_ctx' &&
    owner !== '$setup' &&
    (!isComponentMethod || owner !== '$options')
  ) {
    return null;
  }
  return memberPropertyName(member);
}

function matchTemplateBinding(
  member: NodeOfType<'MemberExpression'>,
  bindings: ReadonlyMap<string, OrdinarySetupTranslation>,
): { binding: OrdinarySetupTranslation; exposed: string } | null {
  const direct = setupMemberName(member);
  if (direct) {
    const binding = bindings.get(direct);
    if (binding?.kind === 't') return { binding, exposed: direct };
  }
  if (memberPropertyName(member) !== 't') return null;
  const object =
    member.object.type === 'MemberExpression' ? member.object : undefined;
  const exposed = object && setupMemberName(object);
  const binding = exposed ? bindings.get(exposed) : undefined;
  return binding?.kind === 'object' && exposed ? { binding, exposed } : null;
}

function setupMemberName(
  member: NodeOfType<'MemberExpression'>,
): string | null {
  if (
    member.object.type !== 'Identifier' ||
    (member.object.name !== '$setup' && member.object.name !== '_ctx')
  ) {
    return null;
  }
  return memberPropertyName(member);
}

function memberPropertyName(
  member: NodeOfType<'MemberExpression'>,
): string | null {
  return member.computed
    ? member.property.type === 'Literal' &&
      typeof member.property.value === 'string'
      ? member.property.value
      : null
    : member.property.type === 'Identifier'
      ? member.property.name
      : null;
}

function isolateCompiledTemplate(code: string): string {
  return code
    .replace(/^import[^\n]*(?=\n|$)/gm, (value) => ' '.repeat(value.length))
    .replace(
      /\bexport (?=(?:function|const) (?:render|ssrRender)\b)/g,
      '       ',
    );
}
