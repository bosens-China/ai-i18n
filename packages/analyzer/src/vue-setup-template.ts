import type { NodeOfType } from 'yuku-analyzer';
import { analyzeModule } from './index.js';
import {
  findOrdinarySetupTranslations,
  type OrdinarySetupTranslation,
} from './vue-setup-bindings.js';

export interface OrdinarySetupTemplateAnalysis {
  bridgeCode: string;
  templateCode: string;
}

export function createOrdinarySetupTemplateAnalysis(
  scriptCode: string,
  scriptAst: readonly unknown[],
  templateCode: string,
): OrdinarySetupTemplateAnalysis | null {
  const bindings = findOrdinarySetupTranslations(scriptAst);
  if (!bindings.size) return null;

  const module = analyzeModule(templateCode, 'ai-i18n-vue-template.js');
  const replacements: Array<{
    binding: OrdinarySetupTranslation;
    end: number;
    exposed: string;
    start: number;
  }> = [];
  module.walk({
    MemberExpression(node) {
      const match = matchTemplateBinding(node, bindings);
      if (match)
        replacements.push({ ...match, start: node.start, end: node.end });
    },
  });
  if (!replacements.length) return null;

  const bridges = new Map<string, { hook: string; name: string }>();
  let bridgeIndex = 0;
  for (const { binding, exposed } of replacements) {
    if (bridges.has(exposed)) continue;
    let name: string;
    do {
      name = `__a${(bridgeIndex++).toString(36)}`;
    } while (scriptCode.includes(name) || templateCode.includes(name));
    bridges.set(exposed, { hook: binding.hook, name });
  }

  let transformed = templateCode;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    const bridge = bridges.get(replacement.exposed)!.name;
    const length = replacement.end - replacement.start;
    // 等长替换保留 compiler-sfc 生成位置，后续可直接复用模板 source map。
    transformed =
      transformed.slice(0, replacement.start) +
      bridge.padEnd(length, ' ') +
      transformed.slice(replacement.end);
  }

  return {
    bridgeCode: [...bridges.values()]
      .map(({ hook, name }) => `const { t: ${name} } = ${hook}();`)
      .join('\n'),
    templateCode: isolateCompiledTemplate(transformed),
  };
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
