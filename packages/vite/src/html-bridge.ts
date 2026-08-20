import type { ModuleMessages } from '@ai-i18n/core';
import type { HtmlBinding } from './html.js';
import {
  ATTRIBUTE_MARKER_PREFIX,
  COMMENT_MARKER_PREFIX,
  TEXT_MARKER,
} from './html-markers.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

export function htmlBridgeCode(
  moduleId: string,
  messages: ModuleMessages,
  bindings: readonly HtmlBinding[],
): string {
  const sources = Object.fromEntries(
    bindings.map((binding) => [binding.messageId, binding.source]),
  );
  return `
import { subscribe, __registerModule, __unregisterModule, __translate } from ${JSON.stringify(`${AI_I18N_VIRTUAL_MODULE_ID}/internal`)};
const moduleId = ${JSON.stringify(moduleId)};
const sources = ${JSON.stringify(sources)};
const bindings = ${JSON.stringify(bindings)};
const reviewTargetSymbol = Symbol.for('ai-i18n.review.targets');
const attachReviewTarget = (node, binding) => {
  const [line, column] = binding.occurrence.split(':').map(Number);
  const target = {
    key: JSON.stringify([binding.source, binding.comment ?? null]),
    file: moduleId,
    location: { line, column },
  };
  const current = node[reviewTargetSymbol] ?? [];
  if (current.some((item) => item.key === target.key && item.file === target.file && item.location.line === line && item.location.column === column)) return;
  Object.defineProperty(node, reviewTargetSymbol, {
    configurable: true,
    value: [...current, target],
  });
};
__registerModule(moduleId, ${JSON.stringify(messages)});
const apply = () => {
  for (const binding of bindings) {
    const value = __translate(moduleId, binding.messageId, sources[binding.messageId], binding.occurrence);
    if (binding.kind === 'text') {
      document.querySelectorAll('[${TEXT_MARKER}="' + binding.marker + '"]').forEach((node) => { node.textContent = value; attachReviewTarget(node, binding); });
    } else if (binding.kind === 'attribute') {
      document.querySelectorAll('[' + ${JSON.stringify(ATTRIBUTE_MARKER_PREFIX)} + binding.attribute + '="' + binding.marker + '"]').forEach((node) => { node.setAttribute(binding.attribute, value); attachReviewTarget(node, binding); });
    }
  }
  const comments = new Map(bindings.filter((binding) => binding.kind === 'comment').map((binding) => [${JSON.stringify(COMMENT_MARKER_PREFIX)} + binding.marker, binding]));
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
  let comment;
  while ((comment = walker.nextNode())) {
    const binding = comments.get(comment.data);
    if (binding && comment.nextSibling?.nodeType === Node.TEXT_NODE) {
      comment.nextSibling.nodeValue = __translate(moduleId, binding.messageId, binding.source, binding.occurrence);
      attachReviewTarget(comment.parentElement ?? comment.nextSibling, binding);
    }
  }
};
apply();
const unsubscribe = subscribe(apply);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => { unsubscribe(); __unregisterModule(moduleId); });
}
`;
}
