import { NodeTypes, type RootNode, type SimpleExpressionNode } from '@vue/compiler-dom';
import { parse, type SFCBlock, type SFCDescriptor } from '@vue/compiler-sfc';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  type SourceExtraction,
  type SourceExtractor,
  type SourceLocation,
} from '@ai-i18n/vite';

interface Segment {
  analysisStartLine: number;
  analysisEndLine: number;
  sourceStartLine: number;
  sourceStartColumn: number;
}

export interface VueExtractor extends SourceExtractor {
  readonly kind: 'vue';
}

export function vue(): VueExtractor {
  return {
    kind: 'vue',
    test: (id) => !id.startsWith('\0') && id.endsWith('.vue'),
    extract: extractVue,
  };
}

function extractVue(source: string, id: string): SourceExtraction {
  const { descriptor, errors } = parse(source, { filename: id });
  if (errors.length) {
    throw new Error(
      `[ai-i18n] failed to parse ${id}: ${errors.map(formatError).join('; ')}`,
    );
  }

  const alias = templateAlias(source);
  const analysis = createAnalysis(descriptor, alias);
  const registrationBlock = writableScriptBlock(descriptor);
  return {
    analysisCode: analysis.code,
    mapLocation: createLocationMapper(analysis.segments),
    translationHooks: [
      { module: '@ai-i18n/vue', hook: 'useI18n', property: 't' },
    ],
    registration: registrationBlock
      ? { offset: registrationBlock.loc.start.offset }
      : {
          offset: 0,
          prefix: '<script setup>\n',
          suffix: '</script>\n',
        },
  };
}

function createAnalysis(descriptor: SFCDescriptor, alias: string) {
  const parts: string[] = [];
  const segments: Segment[] = [];
  let nextLine = 1;

  function append(content: string, location?: SourceLocation) {
    if (!content) return;
    const lineCount = countNewlines(content);
    if (location) {
      segments.push({
        analysisStartLine: nextLine,
        analysisEndLine: nextLine + lineCount,
        sourceStartLine: location.line,
        sourceStartColumn: location.column,
      });
    }
    parts.push(content, '\n');
    nextLine += lineCount + 1;
  }

  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (block && !block.src) {
      append(block.content, {
        line: block.loc.start.line,
        column: block.loc.start.column - 1,
      });
    }
  }
  append(
    `import { t as ${alias} } from ${JSON.stringify(AI_I18N_VIRTUAL_MODULE_ID)};`,
  );
  for (const expression of templateExpressions(descriptor.template?.ast)) {
    const rewritten = rewriteTemplateCalls(expression, alias);
    if (rewritten) {
      append(`${rewritten};`, {
        line: expression.loc.start.line,
        column: expression.loc.start.column - 1,
      });
    }
  }
  return { code: parts.join(''), segments };
}

function templateExpressions(root: RootNode | undefined): SimpleExpressionNode[] {
  if (!root) return [];
  const expressions: SimpleExpressionNode[] = [];

  function visit(node: RootNode | RootNode['children'][number]) {
    if (node.type === NodeTypes.INTERPOLATION) {
      if (node.content.type === NodeTypes.SIMPLE_EXPRESSION) {
        expressions.push(node.content);
      }
      return;
    }
    if (node.type !== NodeTypes.ROOT && node.type !== NodeTypes.ELEMENT) return;
    if (node.type === NodeTypes.ELEMENT) {
      for (const property of node.props) {
        if (
          property.type === NodeTypes.DIRECTIVE &&
          property.exp?.type === NodeTypes.SIMPLE_EXPRESSION
        ) {
          expressions.push(property.exp);
        }
      }
    }
    for (const child of node.children) visit(child);
  }

  visit(root);
  return expressions;
}

function rewriteTemplateCalls(
  expression: SimpleExpressionNode,
  alias: string,
): string | null {
  const offsets: number[] = [];
  collectTranslationCallOffsets(expression.ast, offsets);
  if (!offsets.length) return null;
  let rewritten = expression.content;
  for (const offset of offsets.reverse()) {
    rewritten = `${rewritten.slice(0, offset)}${alias}${rewritten.slice(offset + 1)}`;
  }
  return rewritten;
}

function collectTranslationCallOffsets(node: unknown, offsets: number[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectTranslationCallOffsets(child, offsets);
    return;
  }
  const record = node as Record<string, unknown>;
  const callee = record.callee as Record<string, unknown> | undefined;
  if (
    record.type === 'CallExpression' &&
    callee?.type === 'Identifier' &&
    callee.name === 't' &&
    typeof callee.start === 'number'
  ) {
    // Vue 为表达式补了一层括号，Babel AST 的 offset 因此比原文多 1。
    offsets.push(callee.start - 1);
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'loc' || key === 'comments' || key === 'errors') continue;
    collectTranslationCallOffsets(child, offsets);
  }
}

function createLocationMapper(
  segments: readonly Segment[],
): (location: SourceLocation) => SourceLocation {
  return (location) => {
    const segment = segments.find(
      (candidate) =>
        location.line >= candidate.analysisStartLine &&
        location.line <= candidate.analysisEndLine,
    );
    if (!segment) return location;
    const lineOffset = location.line - segment.analysisStartLine;
    return {
      line: segment.sourceStartLine + lineOffset,
      column:
        location.column + (lineOffset === 0 ? segment.sourceStartColumn : 0),
    };
  };
}

function writableScriptBlock(descriptor: SFCDescriptor): SFCBlock | null {
  if (descriptor.script && !descriptor.script.src) return descriptor.script;
  if (descriptor.scriptSetup && !descriptor.scriptSetup.src) {
    return descriptor.scriptSetup;
  }
  return null;
}

function templateAlias(source: string): string {
  return ['τ', 'δ', 'ζ', 'η', 'θ'].find((candidate) => !source.includes(candidate))!;
}

function countNewlines(value: string): number {
  return value.split('\n').length - 1;
}

function formatError(error: Error | { message: string }): string {
  return error.message;
}
