import type { LangOption } from '@ai-i18n/core';

export interface FileStoreOptions {
  root: string;
  sourceLang: string;
  locales: readonly LangOption[];
  directory?: string;
}
