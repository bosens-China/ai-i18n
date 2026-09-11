import { diagnosticMessage } from './diagnostics.js';
import type { I18nRuntimeOptions } from './runtime.js';

export function resolvePersistenceKey(
  persist: I18nRuntimeOptions['persist'],
): string | undefined {
  if (!persist) return undefined;
  if (persist === true) return 'ai-i18n:lang';
  const key = persist.key.trim();
  if (!key) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] persist.key 不能为空。',
        '[ai-i18n] persist.key must not be empty.',
      ),
    );
  }
  return key;
}

export function readPersistedLang(
  key: string | undefined,
  locales: ReadonlySet<string>,
): string | undefined {
  if (!key) return undefined;
  try {
    const value = globalThis.localStorage?.getItem(key) ?? undefined;
    return value && locales.has(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writePersistedLang(
  key: string | undefined,
  value: string,
): void {
  if (!key) return;
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // 隐私模式、禁用存储或配额错误不应阻断语言切换。
  }
}
