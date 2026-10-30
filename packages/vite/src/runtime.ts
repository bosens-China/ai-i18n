export {
  createI18nRuntime,
  createScopedTranslate,
  formatTemplateMessage,
  runtimeMessageId,
} from '@ai-i18n/core';
export { createTranslationMetaState } from './runtime-meta.js';
import type { JsonValue } from './runtime-meta.js';
export type { JsonValue } from './runtime-meta.js';

/** 应用通过模块扩展注册公开译文元数据类型。 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

export type TranslationMeta = Register extends {
  translationMeta: infer Meta extends object;
}
  ? Readonly<Meta>
  : Readonly<Record<string, JsonValue>>;
