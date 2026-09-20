import type { SFCBlock } from '@vue/compiler-sfc';
import {
  analyzeModule,
  type AnalysisLanguage,
  type SourceLocation,
} from './index.js';
import {
  node,
  nodes,
  propertyName,
  unwrapNode,
  type AstNode,
} from './vue-ast-utils.js';

// Vue 将静态 withDefaults 默认值复制到生成的 props，未为这些片段提供 source map。
// 按属性名关联原始表达式，不能按文案或出现顺序匹配（属性可能重排、文案可能重复）。
export function createVueDefaultLocationMapper(
  source: string,
  setup: SFCBlock,
  statements: readonly unknown[],
  code: string,
  lang: AnalysisLanguage,
): (location: SourceLocation) => SourceLocation | undefined {
  const defaults = new Map<string, AstNode>();
  function visit(value: unknown): void {
    if (Array.isArray(value)) return value.forEach(visit);
    const current = node(value);
    if (!current) return;
    if (
      current.type === 'CallExpression' &&
      node(current.callee)?.name === 'withDefaults'
    ) {
      const argument = nodes(current.arguments)[1];
      for (const property of nodes(argument?.properties)) {
        const name = propertyName(property.key);
        const expression = node(property.value ?? property.body);
        if (name !== null && expression) defaults.set(name, expression);
      }
      return;
    }
    Object.values(current).forEach(visit);
  }
  statements.forEach(visit);
  if (!defaults.size) return () => undefined;

  const ranges: Array<{ start: number; end: number; original: number }> = [];
  const module = analyzeModule(code, 'ai-i18n-vue-defaults', undefined, lang);
  for (const statement of module.ast.body) {
    if (statement.type !== 'ExportDefaultDeclaration') continue;
    const declaration = unwrapNode(node(statement.declaration));
    const options =
      declaration?.type === 'CallExpression'
        ? nodes(declaration.arguments)
        : declaration
          ? [declaration]
          : [];
    for (const option of options) {
      const props = nodes(option.properties).find(
        (property) => propertyName(property.key) === 'props',
      );
      for (const property of nodes(node(props?.value)?.properties)) {
        const original = defaults.get(propertyName(property.key) ?? '');
        if (!original) continue;
        const generated = nodes(node(property.value)?.properties).find(
          (item) => propertyName(item.key) === 'default',
        );
        let expression = node(generated?.value);
        if (generated?.method) expression = node(expression?.body);
        if (!expression) continue;
        const start = Number(expression.start);
        const end = Number(expression.end);
        const originalStart = Number(original.start);
        // 只映射编译器原样复制的范围，避免将改写后的代码猜测成源码位置。
        if (
          code.slice(start, end) !==
          setup.content.slice(originalStart, Number(original.end))
        )
          continue;
        ranges.push({
          start,
          end,
          original: setup.loc.start.offset + originalStart,
        });
      }
    }
  }
  const lineStarts = [0];
  for (let index = 0; index < code.length; index++) {
    if (code[index] === '\n') lineStarts.push(index + 1);
  }
  return (location) => {
    const offset =
      (lineStarts[location.line - 1] ?? code.length) + location.column;
    const range = ranges.find(
      ({ start, end }) => offset >= start && offset < end,
    );
    if (!range) return undefined;
    const prefix = source
      .slice(0, range.original + offset - range.start)
      .split('\n');
    return { line: prefix.length, column: prefix.at(-1)!.length };
  };
}
