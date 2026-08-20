export interface OccurrenceBindable<T> {
  __aiI18nAt(occurrence: string): T;
}

export function attachOccurrenceBinding<
  T extends (...args: never[]) => unknown,
>(target: T, bind: (occurrence: string) => T): T & OccurrenceBindable<T> {
  Object.defineProperty(target, '__aiI18nAt', {
    value: bind,
    configurable: true,
  });
  return target as T & OccurrenceBindable<T>;
}
