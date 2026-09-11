import { diagnosticMessage } from './diagnostics.js';
import type { LocaleMessages, ModuleMessages } from './runtime.js';

export function validateLocaleMessages(
  locale: string,
  messages: LocaleMessages,
): void {
  for (const [id, value] of Object.entries(messages)) {
    if (typeof value !== 'string' && value !== null) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] locale“${locale}”的消息“${id}”必须是字符串或 null。`,
          `[ai-i18n] locale "${locale}" message "${id}" must be a string or null.`,
        ),
      );
    }
  }
}

export function validateModule(
  moduleId: string,
  messages: ModuleMessages,
  locales: Set<string>,
  localeCount: number,
): void {
  const entries = Object.entries(messages);
  if (entries.length !== localeCount) {
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] 模块“${moduleId}”必须注册每个 locale。`,
        `[ai-i18n] module "${moduleId}" must register every locale.`,
      ),
    );
  }
  for (const [locale, localeMessages] of entries) {
    if (!locales.has(locale)) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] 模块“${moduleId}”注册了未知 locale“${locale}”。`,
          `[ai-i18n] module "${moduleId}" registered unknown locale "${locale}".`,
        ),
      );
    }
    for (const [id, value] of Object.entries(localeMessages)) {
      if (typeof value !== 'string' && value !== null) {
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] 模块“${moduleId}”的消息“${id}”必须是字符串或 null。`,
            `[ai-i18n] module "${moduleId}" message "${id}" must be a string or null.`,
          ),
        );
      }
    }
  }
}
