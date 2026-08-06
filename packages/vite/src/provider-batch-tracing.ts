import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { TranslationBatchEvent, Translator } from '@ai-i18n/core';

export function reportTranslationBatchEvent(
  translator: Translator,
  event: TranslationBatchEvent,
  onWarning: (message: string) => void,
): void {
  const warn = (cause: unknown) => {
    const reason = cause instanceof Error ? cause.message : String(cause);
    onWarning(
      diagnosticMessage(
        `翻译批次追踪失败，翻译将继续。原因：${reason}`,
        `Translation batch tracing failed; translation will continue. Cause: ${reason}`,
      ),
    );
  };
  try {
    const pending = translator.reportBatchEvent?.(event);
    if (pending) void Promise.resolve(pending).catch(warn);
  } catch (cause) {
    warn(cause);
  }
}
