import type { TranslationValue } from './schema.js';

export interface TranslationRequest {
  messageId: string;
  source: string;
  comment?: string;
  locale: string;
}

export interface TranslationResult {
  messageId: string;
  locale: string;
  value: TranslationValue;
}

export type Translator = (
  requests: readonly TranslationRequest[],
) => Promise<readonly TranslationResult[]>;
