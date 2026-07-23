import type { LangOption, Translator } from '@ai-i18n/core';
import type { AiI18nFramework } from './framework.js';
import type { HtmlExtractorOptions } from './html.js';
import type { ProviderCoordinatorOptions } from './provider-coordinator.js';

export type AiI18nProviderOptions = Pick<
  ProviderCoordinatorOptions,
  'debounceMs' | 'batchLength' | 'maxConcurrency' | 'strict'
>;

export interface AiI18nOptions {
  framework?: AiI18nFramework;
  autoImport?: boolean;
  dts?: string | false;
  sourceLang: string;
  defaultLang?: string;
  locales: readonly LangOption[];
  translator?: Translator;
  provider?: AiI18nProviderOptions;
  directory?: string;
  cleanup?: {
    missingSourceFiles?: boolean;
    orphanMessages?: boolean;
  };
  html?: boolean | HtmlExtractorOptions;
}
