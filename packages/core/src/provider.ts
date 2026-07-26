import type { TranslationValue } from './schema.js';

export interface TranslationMessage {
  source: string;
  comment?: string;
}

export interface TranslationBatch {
  locales: readonly string[];
  messages: readonly TranslationMessage[];
}

export type TranslationResult = Readonly<Record<string, TranslationValue>>;

export type Translator = (
  batch: TranslationBatch,
) => Promise<readonly TranslationResult[]>;
