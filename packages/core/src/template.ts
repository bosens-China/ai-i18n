const TEMPLATE_TOKEN_RE = /\{\{(=*)(\d+)\}\}/g;

export function escapeTemplateLiteral(value: string): string {
  return value.replace(
    TEMPLATE_TOKEN_RE,
    (_token, escapes: string, index: string) => `{{=${escapes}${index}}}`,
  );
}

export function createTemplateMessage(strings: readonly string[]): string {
  return strings
    .map((part, index) =>
      index === strings.length - 1
        ? escapeTemplateLiteral(part)
        : `${escapeTemplateLiteral(part)}{{${index}}}`,
    )
    .join('');
}

export function formatTemplateMessage(
  message: string,
  values: readonly unknown[],
): string {
  return message.replace(
    TEMPLATE_TOKEN_RE,
    (token, escapes: string, index: string) => {
      if (escapes) return `{{${escapes.slice(1)}${index}}}`;
      const valueIndex = Number(index);
      return valueIndex < values.length ? String(values[valueIndex]) : token;
    },
  );
}

function templateTokenSignature(message: string): string {
  return JSON.stringify(
    [...message.matchAll(TEMPLATE_TOKEN_RE)].map((match) => match[0]).sort(),
  );
}

export function hasSameTemplateTokens(
  source: string,
  translation: string,
): boolean {
  return templateTokenSignature(source) === templateTokenSignature(translation);
}
