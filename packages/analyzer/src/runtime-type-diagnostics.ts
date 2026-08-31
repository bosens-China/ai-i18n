import type {
  Module,
  NodeOfType,
  NodeType,
  Symbol as YukuSymbol,
} from 'yuku-analyzer';

type Node = NodeOfType<NodeType>;

export interface RuntimeTypedTranslationCall {
  name: string;
  start: number;
}

const RUNTIME_TYPE_MODULES = new Set(['@ai-i18n/core', '@ai-i18n/vite']);

/**
 * TypeScript 类型不能证明运行时实参来源；这里只识别明确的 ai-i18n 类型，避免误报普通同名函数。
 */
export function findRuntimeTypedLocalTranslationCalls(
  module: Module,
): RuntimeTypedTranslationCall[] {
  const runtimeTypes = new Set<YukuSymbol>();
  for (const item of module.imports) {
    if (
      item.typeOnly &&
      item.name === 'I18nRuntime' &&
      RUNTIME_TYPE_MODULES.has(item.specifier) &&
      item.local
    ) {
      runtimeTypes.add(item.local);
    }
  }

  const calls: RuntimeTypedTranslationCall[] = [];
  const add = (node: Node, callee: Node) => {
    if (callee.type !== 'Identifier') return;
    const symbol = module.symbolOf(callee);
    if (
      !symbol?.declarations.some((declaration) =>
        isRuntimeTranslateDeclaration(declaration, module, runtimeTypes),
      )
    ) {
      return;
    }
    calls.push({ name: callee.name, start: node.start });
  };

  module.walk({
    CallExpression(node) {
      add(node, node.callee);
    },
    TaggedTemplateExpression(node) {
      add(node, node.tag);
    },
  });
  return calls;
}

function isRuntimeTranslateDeclaration(
  declaration: Node,
  module: Module,
  runtimeTypes: ReadonlySet<YukuSymbol>,
): boolean {
  if (declaration.type !== 'Identifier') return false;
  const type = declaration.typeAnnotation?.typeAnnotation;
  if (
    type?.type !== 'TSIndexedAccessType' ||
    type.indexType.type !== 'TSLiteralType' ||
    type.indexType.literal.type !== 'Literal' ||
    type.indexType.literal.value !== 't'
  ) {
    return false;
  }
  const object = type.objectType;
  if (
    object.type === 'TSTypeReference' &&
    object.typeName.type === 'Identifier'
  ) {
    const symbol = module.symbolOf(object.typeName);
    return Boolean(symbol && runtimeTypes.has(symbol));
  }
  return (
    object.type === 'TSImportType' &&
    typeof object.source.value === 'string' &&
    RUNTIME_TYPE_MODULES.has(object.source.value) &&
    object.qualifier?.type === 'Identifier' &&
    object.qualifier.name === 'I18nRuntime'
  );
}
