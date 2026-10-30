import type { TranslationMeta } from './runtime.js';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export function createTranslationMetaState(initial?: TranslationMeta) {
  let current = freeze(initial);
  return {
    get: (): TranslationMeta | undefined => current,
    replace(value: TranslationMeta | undefined) {
      current = freeze(value);
    },
  };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
