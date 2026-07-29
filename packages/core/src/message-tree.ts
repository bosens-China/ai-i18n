export type MessageTreeValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | readonly MessageTreeValue[]
  | { readonly [key: string]: MessageTreeValue };

export type MessageTree =
  readonly MessageTreeValue[] | { readonly [key: string]: MessageTreeValue };

export type TranslatedMessageTree<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { [K in keyof T]: TranslatedMessageTree<T[K]> }
    : T extends object
      ? { [K in keyof T]: TranslatedMessageTree<T[K]> }
      : T;

export function translateMessageTree<T extends MessageTree>(
  value: T,
  translate: (source: string) => string,
): TranslatedMessageTree<T> {
  // 运行时递归已经校验结构；通过 unknown 隔离递归联合类型之间的深度比较。
  return mapMessageTree(
    value,
    translate,
    new WeakSet(),
  ) as unknown as TranslatedMessageTree<T>;
}

function mapMessageTree(
  value: MessageTreeValue,
  translate: (source: string) => string,
  ancestors: WeakSet<object>,
): MessageTreeValue {
  if (typeof value === 'string') return translate(value);
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) {
    throw new TypeError(
      '[ai-i18n] 文案树不能包含循环引用 / Message trees cannot contain circular references.',
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => mapMessageTree(item, translate, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        '[ai-i18n] 文案树只能包含普通对象和数组 / Message trees may only contain plain objects and arrays.',
      );
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        mapMessageTree(item, translate, ancestors),
      ]),
    );
  } finally {
    ancestors.delete(value);
  }
}
