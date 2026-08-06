import { isAbsolute, resolve } from 'node:path';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { TranslationLogging } from '@ai-i18n/core';

export function resolveProviderLogging(
  value: boolean | string | undefined,
  root: string,
): TranslationLogging {
  if (value === undefined || value === false) return false;
  if (value === true) return resolve(root, 'logs');

  const directory = value.trim();
  if (!directory) {
    throw new TypeError(
      diagnosticMessage(
        '[ai-i18n] provider.logging 作为字符串时不能为空。',
        '[ai-i18n] provider.logging must not be empty when it is a string.',
      ),
    );
  }
  return isAbsolute(directory) ? directory : resolve(root, directory);
}
