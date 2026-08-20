import MagicString from 'magic-string';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { formatTemplateMessage, translationOccurrenceKey } from '@ai-i18n/core';
import {
  ATTRIBUTE_MARKER_PREFIX,
  COMMENT_MARKER_PREFIX,
  TEXT_MARKER,
} from './html-markers.js';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  analyzeModule,
  extractMessages,
  type ExtractedMessage,
} from './yuku-analyzer.js';

const DEFAULT_ATTRIBUTES = [
  'alt',
  'aria-label',
  'placeholder',
  'title',
] as const;
export { htmlBridgeCode } from './html-bridge.js';

export interface HtmlExtractorOptions {
  attributes?: readonly string[];
}

export interface HtmlExtractor {
  readonly kind: 'html';
  readonly attributes: readonly string[];
}

export interface HtmlTransformResult {
  code: string;
  messages: ExtractedMessage[];
  warnings: Array<{ line: number; column: number; message: string }>;
  bindings: HtmlBinding[];
}

export interface HtmlBinding {
  kind: 'text' | 'comment' | 'attribute';
  messageId: string;
  source: string;
  comment?: string;
  occurrence: string;
  marker: string;
  attribute?: string;
}

export function html(options: HtmlExtractorOptions = {}): HtmlExtractor {
  const attributes = options.attributes ?? DEFAULT_ATTRIBUTES;
  for (const attribute of attributes) {
    if (!/^[a-z][a-z0-9-]*$/.test(attribute)) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] HTML 属性“${attribute}”无效。`,
          `[ai-i18n] Invalid HTML attribute "${attribute}".`,
        ),
      );
    }
  }
  return { kind: 'html', attributes: [...new Set(attributes)] };
}

export function isTransformedHtml(source: string): boolean {
  return source.includes(TEXT_MARKER) || source.includes(COMMENT_MARKER_PREFIX);
}

export function transformHtml(
  source: string,
  filename: string,
  extractor: HtmlExtractor,
  initialValues?: Readonly<Record<string, string | null>>,
): HtmlTransformResult {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const transformed = new MagicString(source);
  const messages = new Map<string, ExtractedMessage>();
  const warnings: HtmlTransformResult['warnings'] = [];
  const bindings: HtmlBinding[] = [];
  let commentMarker = 0;

  walk(document, (node) => {
    if (isTextNode(node)) {
      const location = node.sourceCodeLocation;
      const parent = node.parentNode;
      if (!location || !isElement(parent) || shouldSkipElement(parent)) return;
      const expression = node.value.trim();
      if (!looksLikeTranslation(expression)) return;
      const message = extractExpression(expression, filename);
      const position = sourcePosition(
        source,
        location.startOffset + leading(node.value),
      );
      if (!message) {
        warnings.push({
          ...position,
          message: diagnosticMessage(
            'HTML 中 t() 的参数必须是可静态提取的字符串。',
            'HTML t() arguments must be statically extractable strings.',
          ),
        });
        return;
      }
      addMessage(messages, message, position);
      const occurrence = translationOccurrenceKey(position);
      const initialValue = formatTemplateMessage(
        initialValues?.[htmlBindingKey(message.id, occurrence)] ??
          initialValues?.[message.id] ??
          message.source,
        [],
      );
      const before = node.value.slice(0, leading(node.value));
      const after = node.value.slice(node.value.length - trailing(node.value));
      const replacement = `${before}${escapeText(initialValue)}${after}`;
      if (
        parent.childNodes.length === 1 &&
        parent.sourceCodeLocation?.startTag
      ) {
        const marker = encodeURIComponent(
          htmlBindingKey(message.id, occurrence),
        );
        insertAttribute(
          transformed,
          source,
          parent,
          `${TEXT_MARKER}="${marker}"`,
        );
        bindings.push({
          kind: 'text',
          messageId: message.id,
          source: message.source,
          ...(message.comment ? { comment: message.comment } : {}),
          occurrence,
          marker,
        });
        transformed.overwrite(
          location.startOffset,
          location.endOffset,
          replacement,
        );
      } else {
        const marker = String(commentMarker++);
        bindings.push({
          kind: 'comment',
          messageId: message.id,
          source: message.source,
          ...(message.comment ? { comment: message.comment } : {}),
          occurrence,
          marker,
        });
        transformed.overwrite(
          location.startOffset,
          location.endOffset,
          `<!--${COMMENT_MARKER_PREFIX}${marker}-->${replacement}`,
        );
      }
      return;
    }

    if (!isElement(node) || shouldSkipElement(node)) return;
    for (const attribute of node.attrs) {
      if (!extractor.attributes.includes(attribute.name)) continue;
      const expression = attribute.value.trim();
      if (!looksLikeTranslation(expression)) continue;
      const location = node.sourceCodeLocation?.attrs?.[attribute.name];
      if (!location) continue;
      const valueRange = attributeValueRange(
        source,
        location.startOffset,
        location.endOffset,
      );
      const position = sourcePosition(source, valueRange.start);
      const message = extractExpression(expression, filename);
      if (!message) {
        warnings.push({
          ...position,
          message: diagnosticMessage(
            'HTML 中 t() 的参数必须是可静态提取的字符串。',
            'HTML t() arguments must be statically extractable strings.',
          ),
        });
        continue;
      }
      addMessage(messages, message, position);
      const occurrence = translationOccurrenceKey(position);
      const marker = encodeURIComponent(htmlBindingKey(message.id, occurrence));
      insertAttribute(
        transformed,
        source,
        node,
        `${ATTRIBUTE_MARKER_PREFIX}${attribute.name}="${marker}"`,
      );
      transformed.overwrite(
        valueRange.start,
        valueRange.end,
        escapeAttribute(
          formatTemplateMessage(
            initialValues?.[htmlBindingKey(message.id, occurrence)] ??
              initialValues?.[message.id] ??
              message.source,
            [],
          ),
        ),
      );
      bindings.push({
        kind: 'attribute',
        messageId: message.id,
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        occurrence,
        marker,
        attribute: attribute.name,
      });
    }
  });

  return {
    code: transformed.toString(),
    messages: [...messages.values()],
    warnings,
    bindings,
  };
}

export function htmlBindingKey(messageId: string, occurrence: string): string {
  return `${messageId}\0${occurrence}`;
}

function extractExpression(expression: string, filename: string) {
  const prefix = `import { t } from ${JSON.stringify(AI_I18N_VIRTUAL_MODULE_ID)};\n`;
  try {
    const module = analyzeModule(
      `${prefix}${expression}`,
      `${filename}?html-expression`,
    );
    const body = module.ast.body as Array<{
      type: string;
      start: number;
      end: number;
      expression?: { type: string; callee?: { type: string; name?: string } };
    }>;
    const statement = body[1];
    if (
      body.length !== 2 ||
      statement?.type !== 'ExpressionStatement' ||
      statement.start !== prefix.length ||
      statement.end !== prefix.length + expression.length ||
      statement.expression?.type !== 'CallExpression' ||
      statement.expression.callee?.type !== 'Identifier' ||
      statement.expression.callee.name !== 't'
    ) {
      return null;
    }
    const result = extractMessages(module);
    return !result.pending &&
      !result.warnings.length &&
      result.messages.length === 1
      ? result.messages[0]!
      : null;
  } catch {
    return null;
  }
}

function walk(
  node: DefaultTreeAdapterTypes.Node,
  visit: (node: DefaultTreeAdapterTypes.Node) => void,
): void {
  visit(node);
  if ('childNodes' in node) {
    for (const child of node.childNodes) walk(child, visit);
  }
}

function isElement(
  node: DefaultTreeAdapterTypes.Node | null,
): node is DefaultTreeAdapterTypes.Element {
  return Boolean(node && 'tagName' in node);
}

function isTextNode(
  node: DefaultTreeAdapterTypes.Node,
): node is DefaultTreeAdapterTypes.TextNode {
  return node.nodeName === '#text' && 'value' in node;
}

function shouldSkipElement(element: DefaultTreeAdapterTypes.Element): boolean {
  return (
    element.tagName === 'script' ||
    element.tagName === 'style' ||
    element.tagName === 'template'
  );
}

function insertAttribute(
  transformed: MagicString,
  source: string,
  element: DefaultTreeAdapterTypes.Element,
  attribute: string,
): void {
  const startTag = element.sourceCodeLocation?.startTag;
  if (!startTag) return;
  const offset =
    startTag.endOffset - (source[startTag.endOffset - 2] === '/' ? 2 : 1);
  transformed.appendLeft(offset, ` ${attribute}`);
}

function attributeValueRange(source: string, start: number, end: number) {
  const raw = source.slice(start, end);
  const equals = raw.indexOf('=');
  if (equals < 0) return { start: end, end };
  let valueStart = equals + 1;
  while (/\s/.test(raw[valueStart] ?? '')) valueStart += 1;
  const quote = raw[valueStart];
  if (quote === '"' || quote === "'") {
    return {
      start: start + valueStart + 1,
      end: start + raw.lastIndexOf(quote),
    };
  }
  let valueEnd = valueStart;
  while (valueEnd < raw.length && !/\s/.test(raw[valueEnd]!)) valueEnd += 1;
  return { start: start + valueStart, end: start + valueEnd };
}

function addMessage(
  messages: Map<string, ExtractedMessage>,
  message: ExtractedMessage,
  location: { line: number; column: number },
): void {
  const previous = messages.get(message.id);
  if (previous) previous.locations.push(location);
  else messages.set(message.id, { ...message, locations: [location] });
}

function sourcePosition(source: string, offset: number) {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1)!.length };
}

function leading(value: string): number {
  return value.length - value.trimStart().length;
}

function trailing(value: string): number {
  return value.length - value.trimEnd().length;
}

function looksLikeTranslation(value: string): boolean {
  return /^t\s*\(/.test(value);
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
