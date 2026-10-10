import type BetterSqlite3 from 'better-sqlite3';
import type {
  TranslationMemoryCandidatePage,
  TranslationMemoryCandidateQuery,
  TranslationMemoryCandidateTarget,
} from '@ai-i18n/core/translation-memory';

const MATCH =
  'source_lang = ? AND target_lang = ? AND source = ? AND comment = ?';

export function targetParameters(target: TranslationMemoryCandidateTarget) {
  return [
    target.sourceLang,
    target.targetLang,
    target.source,
    target.comment ?? '',
  ];
}

export function uniqueCandidate(
  database: BetterSqlite3.Database,
  target: TranslationMemoryCandidateTarget,
): string | undefined {
  const rows = database
    .prepare(
      `SELECT value, MAX(kind = 'automatic') AS automatic
    FROM candidates WHERE ${MATCH} GROUP BY value ORDER BY value LIMIT 2`,
    )
    .all(...targetParameters(target)) as Array<{
    value: string;
    automatic: number;
  }>;
  return rows.length === 1 && rows[0]!.automatic ? rows[0]!.value : undefined;
}

export function candidatePage(
  database: BetterSqlite3.Database,
  target: TranslationMemoryCandidateTarget,
  query: TranslationMemoryCandidateQuery = {},
): TranslationMemoryCandidatePage {
  const parameters = targetParameters(target);
  const rows = database
    .prepare(
      `SELECT DISTINCT value FROM candidates WHERE ${MATCH}
    ${query.value === undefined ? '' : 'AND value = ?'} ORDER BY value LIMIT 11 OFFSET ?`,
    )
    .all(
      ...parameters,
      ...(query.value === undefined ? [] : [query.value]),
      query.offset ?? 0,
    ) as Array<{ value: string }>;
  const automaticValue = uniqueCandidate(database, target);
  return {
    candidates: rows.slice(0, 10).map(({ value }) => {
      const sources = database
        .prepare(
          `SELECT project, kind, file, line, column_number FROM candidates
        WHERE ${MATCH} AND value = ? ORDER BY project, kind, file, line, column_number LIMIT 11 OFFSET ?`,
        )
        .all(...parameters, value, query.sourceOffset ?? 0) as Array<{
        project: string;
        kind: 'automatic' | 'reviewed';
        file: string;
        line: number;
        column_number: number;
      }>;
      return {
        value,
        sources: sources.slice(0, 10).map((row) => ({
          project: row.project,
          kind: row.kind,
          ...(row.file ? { file: row.file } : {}),
          ...(row.line
            ? { location: { line: row.line, column: row.column_number } }
            : {}),
        })),
        sourcesHasMore: sources.length > 10,
      };
    }),
    hasMore: rows.length > 10,
    ...(automaticValue !== undefined ? { automaticValue } : {}),
  };
}
