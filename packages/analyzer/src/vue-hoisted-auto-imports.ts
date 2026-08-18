import { analyzeModule, type AnalysisLanguage } from './index.js';
import { isNode, node, unwrapNode } from './vue-ast-utils.js';

const HOISTED_SETUP_MACROS = new Set([
  'defineProps',
  'defineEmits',
  'defineOptions',
  'defineModel',
  'withDefaults',
]);

export function findHoistedAutoImportCandidates(
  code: string,
  id: string,
  lang: AnalysisLanguage,
): string[] {
  const module = analyzeModule(
    code,
    `${id}?hoisted-auto-imports`,
    undefined,
    lang,
  );
  const names = new Set<string>();
  for (const statement of module.ast.body) {
    if (containsHoistedSetupMacro(statement)) {
      collectIdentifiers(statement, names);
    }
  }
  return [...names];
}

function containsHoistedSetupMacro(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsHoistedSetupMacro);
  if (!isNode(value)) return false;
  if (value.type === 'CallExpression') {
    const callee = unwrapNode(node(value.callee));
    if (
      callee?.type === 'Identifier' &&
      HOISTED_SETUP_MACROS.has(String(callee.name))
    ) {
      return true;
    }
  }
  return Object.values(value).some(
    (child) =>
      (Array.isArray(child) || isNode(child)) &&
      containsHoistedSetupMacro(child),
  );
}

function collectIdentifiers(value: unknown, result: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectIdentifiers(item, result);
    return;
  }
  if (!isNode(value)) return;
  if (value.type === 'Identifier') result.add(String(value.name));
  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isNode(child))
      collectIdentifiers(child, result);
  }
}
