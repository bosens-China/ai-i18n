import path from 'node:path';
import {
  materializeLocale,
  type MaterializedLocale,
} from './locale-materialization.js';
import { fileId, fileMessageKey } from './repository-paths.js';
import type { PreparedRepository } from './repository-store.js';

export function repositoryCoverage(
  root: string,
  files: PreparedRepository['files'],
  generated: MaterializedLocale,
): { total: number; missing: string[] } {
  const missing = new Set<string>();
  const active = new Set<string>();
  for (const file of files) {
    const id = fileId(root, path.resolve(root, file.source));
    for (const message of file.messages) {
      const key =
        message.scope === 'file' ? fileMessageKey(id, message.id) : message.id;
      active.add(key);
      const available =
        message.scope === 'file'
          ? Object.hasOwn(generated.files[id] ?? {}, key) ||
            Object.hasOwn(generated.global, message.id)
          : Object.hasOwn(generated.global, key);
      if (!available) missing.add(key);
    }
  }
  return { total: active.size, missing: [...missing] };
}

export function summarizeRepository(
  root: string,
  prepared: PreparedRepository,
): {
  file_count: number;
  message_count: number;
  locales: { locale: string; translated: number; missing: number }[];
} {
  const locales = prepared.catalog.locales
    .filter((locale) => locale !== prepared.catalog.sourceLang)
    .map((locale) => {
      const generated = materializeLocale(
        prepared.catalog,
        locale,
        prepared.manual.global[locale] ?? {},
        prepared.manual.files[locale] ?? {},
        prepared.snapshot,
      );
      const coverage = repositoryCoverage(root, prepared.files, generated);
      return {
        locale,
        translated: coverage.total - coverage.missing.length,
        missing: coverage.missing.length,
      };
    });
  return {
    file_count: prepared.files.filter((file) => file.messages.length).length,
    message_count: new Set(
      prepared.files.flatMap((file) =>
        file.messages.map((message) =>
          message.scope === 'file'
            ? fileMessageKey(
                fileId(root, path.resolve(root, file.source)),
                message.id,
              )
            : message.id,
        ),
      ),
    ).size,
    locales,
  };
}
