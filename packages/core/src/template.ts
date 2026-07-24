const TEMPLATE_PLACEHOLDER_RE = /\{\{(\d+)\}\}/g;

export function createTemplateMessage(strings: readonly string[]): string {
  return strings
    .map((part, index) =>
      index === strings.length - 1 ? part : `${part}{{${index}}}`,
    )
    .join('');
}

export function formatTemplateMessage(
  message: string,
  values: readonly unknown[],
): string {
  return message.replace(TEMPLATE_PLACEHOLDER_RE, (placeholder, index) => {
    const valueIndex = Number(index);
    return valueIndex < values.length
      ? String(values[valueIndex])
      : placeholder;
  });
}

export function templatePlaceholderIndexes(message: string): number[] {
  return [...message.matchAll(TEMPLATE_PLACEHOLDER_RE)].map((match) =>
    Number(match[1]),
  );
}
