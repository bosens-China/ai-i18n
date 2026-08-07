import type { TranslationCall } from '@ai-i18n/analyzer';
import type { Rule } from 'eslint';
import {
  isImmediateConsoleEffect,
  nearestFunction,
  type ParentNode,
} from '../common/ast-context.js';

export function reportReactUnsubscribedT(
  context: Rule.RuleContext,
  call: TranslationCall,
  node: Rule.Node,
  jsxOwners: ReadonlySet<ParentNode>,
): void {
  if (call.origin !== 'runtime') return;
  // React 只能通过 useI18n() 订阅，因此只检查 JSX 渲染拥有者。
  const owner = nearestFunction(node);
  if (!owner || !jsxOwners.has(owner) || isImmediateConsoleEffect(node)) {
    return;
  }
  context.report({ node, messageId: 'unsubscribedT' });
}
