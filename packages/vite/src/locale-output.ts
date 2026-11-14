import fs from 'node:fs/promises';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import { writeProtocolJson } from './file-store-io.js';
import { listJsonFiles } from './json-files.js';
import { materializeLocale } from './locale-materialization.js';
import { readManualLocale } from './manual-translations.js';
import type { OverrideMigration } from './override-migration.js';
import type {
  TranslationCatalog,
  TranslationSnapshot,
} from './translation-adapter.js';

/** groupForFile 由构建模块图提供；文件标识到资源包的映射不进入 JSON key。 */
export async function writeLocaleOutput(
  directory: string,
  catalog: TranslationCatalog,
  snapshot: TranslationSnapshot,
  groupForFile: Readonly<Record<string, string>>,
  manual?: OverrideMigration,
): Promise<Map<string, Record<string, string>>> {
  for (const message of catalog.messages) {
    if (message.scope !== 'file') continue;
    const id = message.file!.id;
    const group = groupForFile[id];
    if (!group || !/^[a-zA-Z0-9_-]+$/u.test(group)) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] 文件“${message.file!.path}”没有有效的构建资源组。`,
          `[ai-i18n] File "${message.file!.path}" has no valid build resource group.`,
        ),
      );
    }
  }
  const fileIds = new Set(
    catalog.messages
      .filter((message) => message.scope === 'file')
      .map((message) => message.file!.id),
  );
  const groups = new Set([...fileIds].map((id) => groupForFile[id]!));
  const outputs = new Map<string, Record<string, string>>();
  for (const locale of catalog.locales) {
    if (locale === catalog.sourceLang) continue;
    const localeName = encodeURIComponent(locale);
    const globalManual =
      manual?.global[locale] ??
      (await readManualLocale(directory, locale, 'global'));
    const fileManual =
      manual?.files[locale] ??
      (await readManualLocale(directory, locale, 'file'));
    const materialized = materializeLocale(
      catalog,
      locale,
      globalManual,
      fileManual,
      snapshot,
    );
    outputs.set(
      path.join(directory, 'locales', `${localeName}.json`),
      materialized.global,
    );
    for (const [id, messages] of Object.entries(materialized.files)) {
      const group = groupForFile[id]!;
      const file = path.join(
        directory,
        'locales',
        'files',
        localeName,
        `${group}.json`,
      );
      const packet = outputs.get(file) ?? {};
      Object.assign(packet, messages);
      outputs.set(file, packet);
    }
    for (const group of groups) {
      const file = path.join(
        directory,
        'locales',
        'files',
        localeName,
        `${group}.json`,
      );
      if (!outputs.has(file)) outputs.set(file, {});
    }
  }
  const manifest = Object.fromEntries(
    [...fileIds].sort().map((id) => [id, groupForFile[id]!]),
  );
  const manifestFile = path.join(
    directory,
    'locales',
    'files',
    'manifest.json',
  );
  outputs.set(manifestFile, manifest);
  for (const [file, value] of outputs) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeProtocolJson(file, value);
  }
  const localesRoot = path.join(directory, 'locales');
  for (const file of await listJsonFiles(localesRoot)) {
    if (!file.endsWith('.manual.json') && !outputs.has(file)) await fs.rm(file);
  }
  const filesRoot = path.join(localesRoot, 'files');
  const entries = await fs.readdir(filesRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(filesRoot, entry.name);
    for (const file of await listJsonFiles(folder)) {
      if (!outputs.has(file)) await fs.rm(file);
    }
  }
  return outputs;
}
