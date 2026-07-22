const CURSOR_VERSION = 1;

export interface Page<T> {
  total_count: number;
  count: number;
  items: T[];
  has_more: boolean;
  next_cursor?: string;
  truncated_by_size: boolean;
}

export function paginate<T>(
  items: readonly T[],
  key: (item: T) => string,
  limit: number,
  cursor?: string,
  characterLimit = Number.POSITIVE_INFINITY,
): Page<T> {
  const after = cursor ? decodeCursor(cursor) : undefined;
  const start = after
    ? items.findIndex((item) => key(item).localeCompare(after) > 0)
    : 0;
  const normalizedStart = start < 0 ? items.length : start;
  const requested = items.slice(normalizedStart, normalizedStart + limit);
  const pageItems = [...requested];

  while (pageItems.length > 1 && JSON.stringify(pageItems).length > characterLimit) {
    pageItems.pop();
  }

  const hasMore = normalizedStart + pageItems.length < items.length;
  return {
    total_count: items.length,
    count: pageItems.length,
    items: pageItems,
    has_more: hasMore,
    ...(hasMore && pageItems.length
      ? { next_cursor: encodeCursor(key(pageItems.at(-1)!)) }
      : {}),
    truncated_by_size: pageItems.length < requested.length,
  };
}

function encodeCursor(key: string): string {
  return Buffer.from(JSON.stringify({ version: CURSOR_VERSION, key })).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string): string {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      version?: unknown;
      key?: unknown;
    };
    if (value.version !== CURSOR_VERSION || typeof value.key !== 'string') {
      throw new Error('unsupported cursor');
    }
    return value.key;
  } catch {
    throw new Error('[ai-i18n/mcp] invalid cursor; restart pagination without cursor');
  }
}
