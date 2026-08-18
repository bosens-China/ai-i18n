import type { Module } from 'yuku-analyzer';
import { AI_I18N_VIRTUAL_MODULE_ID } from './analysis-queries.js';

export interface RuntimeImportSpecifier {
  imported: string;
  local: string;
}

export interface RuntimeImportDeclaration {
  start: number;
  end: number;
  specifiers: RuntimeImportSpecifier[];
  placement?: 'module' | 'setup';
}

export function findRuntimeImportDeclarations(
  module: Module,
  runtimeModuleId = AI_I18N_VIRTUAL_MODULE_ID,
): RuntimeImportDeclaration[] {
  const imports: RuntimeImportDeclaration[] = [];
  module.walk({
    ImportDeclaration(node) {
      if (
        node.source.value !== runtimeModuleId ||
        node.importKind === 'type' ||
        node.phase ||
        node.attributes.length ||
        !node.specifiers.length
      ) {
        return;
      }
      const specifiers = node.specifiers.flatMap((specifier) => {
        if (
          specifier.type !== 'ImportSpecifier' ||
          specifier.importKind === 'type'
        ) {
          return [];
        }
        return [
          {
            imported:
              specifier.imported.type === 'Identifier'
                ? specifier.imported.name
                : specifier.imported.value,
            local: specifier.local.name,
          },
        ];
      });
      // 混合 default、namespace 或 type specifier 时保留整条 import，避免部分重写。
      if (specifiers.length !== node.specifiers.length) return;
      imports.push({ start: node.start, end: node.end, specifiers });
    },
  });
  return imports;
}
