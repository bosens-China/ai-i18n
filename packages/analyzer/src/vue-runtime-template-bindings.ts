import {
  isNode,
  node,
  nodes,
  propertyName,
  statementBindings,
} from './vue-ast-utils.js';
import { resolveComponentBinding } from './vue-options-template-bindings.js';

export interface VueComponentMethodRuntimeBinding {
  kind: 'component-method';
  local: string;
}

export type VueTemplateRuntimeBinding =
  'auto-import' | 'explicit-import' | VueComponentMethodRuntimeBinding;

export function findVueTemplateRuntimeBinding(
  scriptAsts: readonly (readonly unknown[])[],
): VueTemplateRuntimeBinding | null {
  const componentBinding = resolveComponentBinding(scriptAsts[0] ?? [], 't');
  if (
    componentBinding?.kind === 'ambiguous' ||
    componentBinding?.kind === 'ordinary'
  ) {
    return null;
  }
  if (componentBinding?.kind === 'runtime') {
    return { kind: 'component-method', local: componentBinding.local };
  }

  let runtimeImport = false;
  for (const scriptAst of scriptAsts) {
    for (const statement of scriptAst.filter(isNode)) {
      if (statement.type === 'ImportDeclaration') {
        for (const specifier of nodes(statement.specifiers)) {
          const local = node(specifier.local);
          if (local?.type !== 'Identifier' || local.name !== 't') continue;
          if (
            statement.importKind === 'type' ||
            specifier.importKind === 'type'
          ) {
            continue;
          }
          const source = node(statement.source)?.value;
          if (
            source === 'virtual:ai-i18n' &&
            specifier.type === 'ImportSpecifier' &&
            propertyName(specifier.imported) === 't'
          ) {
            runtimeImport = true;
          } else {
            return null;
          }
        }
        continue;
      }
      if (statementBindings(statement).has('t')) return null;
    }
  }
  // 普通 script 的 import 不会自动暴露给 template；显式模式必须通过 methods 建桥。
  return runtimeImport
    ? scriptAsts.length > 1
      ? 'explicit-import'
      : null
    : 'auto-import';
}
