import type { TranslationCall } from '@ai-i18n/analyzer';
import type { Rule } from 'eslint';
import {
  isVueTemplateEventHandler,
  nearestFunction,
  type ParentNode,
} from '../common/ast-context.js';
import { resolveVueInstanceMemberOrigin } from './instance-member.js';
import { isOptionsComputedValue, vueOptionsSection } from './options.js';

export function reportVueTranslationLifecycle(
  context: Rule.RuleContext,
  call: TranslationCall,
  node: Rule.Node,
  templateNodes: ReadonlySet<Rule.Node>,
  jsxOwners: ReadonlySet<ParentNode>,
): boolean {
  if (call.origin === 'vue-computed') {
    if (!isOptionsComputedValue(node, context)) {
      context.report({ node, messageId: 'misplacedTComputed' });
    }
    return true;
  }
  if (call.origin !== 'vue-ref') return false;
  if (templateNodes.has(node)) {
    if (!isVueTemplateEventHandler(node)) {
      context.report({ node, messageId: 'renderTRef' });
    }
    return true;
  }
  const section = vueOptionsSection(node, context);
  if (section === 'computed' || section === 'data' || section === 'methods') {
    context.report({ node, messageId: 'optionsTRef' });
    return true;
  }
  if (section === 'render') {
    context.report({ node, messageId: 'renderTRef' });
    return true;
  }
  const owner = nearestFunction(node);
  if (owner && jsxOwners.has(owner)) {
    context.report({ node, messageId: 'renderTRef' });
  }
  return true;
}

export function reportUnsupportedVueInstanceTranslation(
  context: Rule.RuleContext,
  node: Rule.Node,
  isVueFramework: boolean,
  inTemplate: boolean,
): void {
  if (!isVueFramework) return;
  const name = vueInstanceTranslationMemberName(node);
  if (!name) return;
  const origin = resolveVueInstanceMemberOrigin(
    context,
    node,
    name,
    inTemplate,
  );
  if (
    origin === 'local' ||
    origin === 'unknown' ||
    origin === 'not-component'
  ) {
    return;
  }
  context.report({ node, messageId: 'unsupportedInstanceTranslation' });
}

function vueInstanceTranslationMemberName(node: Rule.Node): 't' | '$t' | null {
  if (
    node.type !== 'MemberExpression' ||
    node.object.type !== 'ThisExpression'
  ) {
    return null;
  }
  const name =
    !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : node.computed &&
          node.property.type === 'Literal' &&
          typeof node.property.value === 'string'
        ? node.property.value
        : null;
  return name === 't' || name === '$t' ? name : null;
}
