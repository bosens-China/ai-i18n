import { hasSameTemplateTokens, templateTokens } from '@ai-i18n/core';

export function extractTokens(value: string): string[] {
  return templateTokens(value);
}

export function validateTokens(source: string, translation: string): boolean {
  return hasSameTemplateTokens(source, translation);
}
