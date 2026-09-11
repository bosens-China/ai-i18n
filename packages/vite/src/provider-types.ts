import type {
  TranslationMessage,
  TranslationBatchEvent,
  TranslationLogging,
  TranslationValue,
} from '@ai-i18n/core';
import type { PerformanceRecorder } from './performance-recorder.js';

export interface ProviderRequest extends TranslationMessage {
  messageId: string;
  locales: readonly string[];
}
export interface ProviderResult {
  messageId: string;
  locale: string;
  value: TranslationValue;
}
export interface ProviderCoordinatorOptions {
  performance?: PerformanceRecorder;
  debounceMs?: number;
  batchLength?: number;
  maxConcurrency?: number;
  strict?: boolean;
  /** Translator 批次诊断日志目录；默认关闭。 */
  logging?: TranslationLogging;
  onResults?: (
    results: readonly ProviderResult[],
    context: { batchId: string },
  ) => void | Promise<void>;
  onWarning?: (message: string) => void;
}

export type TranslationBatchEventDetails =
  TranslationBatchEvent extends infer Event
    ? Event extends unknown
      ? Omit<Event, 'logging'>
      : never
    : never;
