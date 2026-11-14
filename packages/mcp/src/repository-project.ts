import fs from 'node:fs/promises';
import path from 'node:path';
import { createMessageId, hasSameTemplateTokens } from '@ai-i18n/core';
import { parseProtocolJson } from '@ai-i18n/core/translation-memory';
import {
  ExtractionIndex,
  buildTranslationCatalog,
  readManualLocale,
  writeManualLocale,
  withManualTranslationQueue,
  type TranslationCatalogEntry,
} from '@ai-i18n/vite/internal/repository';
import { fail } from './errors.js';
import { resolveProject } from './project-discovery.js';

type Project = Awaited<ReturnType<typeof resolveProject>>;

async function catalogFor(configFile: string) {
  const project = await resolveProject(configFile);
  const extracted = new ExtractionIndex(project.vite_root).load();
  const catalog = buildTranslationCatalog(
    project.vite_root,
    project.source_lang,
    project.locales.map((locale) => locale.value),
    extracted,
  );
  return { project, catalog };
}

async function readGenerated(file: string): Promise<Record<string, string>> {
  let content: string;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  const value = parseProtocolJson(content, file).value;
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.values(value).some((item) => typeof item !== 'string')
  ) {
    fail('INVALID_LOCALE_JSON', { file });
  }
  return value as Record<string, string>;
}

function localeDirectory(project: Project): string {
  return path.join(project.i18n_directory, 'locales');
}

async function valuesFor(project: Project, locale: string) {
  const directory = project.i18n_directory;
  const globalManual = await readManualLocale(directory, locale, 'global');
  const fileManual = await readManualLocale(directory, locale, 'file');
  const globalGenerated = await readGenerated(
    path.join(localeDirectory(project), `${encodeURIComponent(locale)}.json`),
  );
  const manifest = await readGenerated(
    path.join(localeDirectory(project), 'files', 'manifest.json'),
  );
  const packets = new Map<string, Record<string, string>>();
  async function value(
    message: TranslationCatalogEntry,
  ): Promise<string | null> {
    const globalKey = createMessageId(message.source, {
      comment: message.comment,
    });
    if (message.scope === 'file' && Object.hasOwn(fileManual, message.key))
      return fileManual[message.key]!;
    if (Object.hasOwn(globalManual, globalKey)) return globalManual[globalKey]!;
    if (message.scope === 'file') {
      const group = manifest[message.file!.id];
      if (group) {
        let packet = packets.get(group);
        if (!packet) {
          packet = await readGenerated(
            path.join(
              localeDirectory(project),
              'files',
              encodeURIComponent(locale),
              `${group}.json`,
            ),
          );
          packets.set(group, packet);
        }
        if (Object.hasOwn(packet, message.key)) return packet[message.key]!;
      }
    }
    return globalGenerated[globalKey] ?? null;
  }
  return value;
}

export async function listRepositoryTranslations(input: {
  config_file: string;
  locale: string;
  view?: 'all' | 'missing';
  source_contains?: string;
  cursor?: string;
  limit?: number;
}) {
  const { project, catalog } = await catalogFor(input.config_file);
  if (
    !project.locales.some((locale) => locale.value === input.locale) ||
    input.locale === project.source_lang
  )
    fail('UNKNOWN_LOCALE', { locale: input.locale });
  const lookup = await valuesFor(project, input.locale);
  const items = [];
  for (const message of catalog.messages) {
    if (input.cursor && message.key <= input.cursor) continue;
    if (
      input.source_contains &&
      !message.source.includes(input.source_contains)
    )
      continue;
    const value = await lookup(message);
    if (input.view !== 'all' && value !== null) continue;
    items.push({
      key: message.key,
      source: message.source,
      ...(message.comment ? { comment: message.comment } : {}),
      scope: message.scope,
      ...(message.file ? { file: message.file.path } : {}),
      value,
    });
    if (items.length > (input.limit ?? 100)) break;
  }
  const limit = input.limit ?? 100;
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  return {
    locale: input.locale,
    items: page,
    has_more: hasMore,
    next_cursor: hasMore ? page.at(-1)?.key : null,
  };
}

export async function editRepositoryTranslations(input: {
  config_file: string;
  locale: string;
  updates: readonly { key: string; value: string | null }[];
  overwrite_existing?: boolean;
}) {
  const { project, catalog } = await catalogFor(input.config_file);
  if (
    !project.locales.some((locale) => locale.value === input.locale) ||
    input.locale === project.source_lang
  )
    fail('UNKNOWN_LOCALE', { locale: input.locale });
  const known = new Map(
    catalog.messages.map((message) => [message.key, message]),
  );
  const seen = new Map<string, string | null>();
  for (const update of input.updates) {
    const message = known.get(update.key);
    if (!message) fail('UNKNOWN_MESSAGE_KEY', { key: update.key });
    if (
      update.value !== null &&
      !hasSameTemplateTokens(message.source, update.value)
    )
      fail('TEMPLATE_TOKEN_MISMATCH', { key: update.key });
    if (seen.has(update.key) && seen.get(update.key) !== update.value)
      fail('TRANSLATION_CONFLICT', { key: update.key });
    seen.set(update.key, update.value);
  }
  return withManualTranslationQueue(project.i18n_directory, async () => {
    const global = await readManualLocale(
      project.i18n_directory,
      input.locale,
      'global',
    );
    const files = await readManualLocale(
      project.i18n_directory,
      input.locale,
      'file',
    );
    let changed = 0;
    const changedScopes = new Set<'global' | 'file'>();
    for (const [key, value] of seen) {
      const dictionary = known.get(key)!.scope === 'file' ? files : global;
      const current = dictionary[key];
      if (
        value !== null &&
        current !== undefined &&
        current !== value &&
        !input.overwrite_existing
      )
        fail('TRANSLATION_CONFLICT', { key, current_value: current });
    }
    for (const [key, value] of seen) {
      const scope = known.get(key)!.scope;
      const dictionary = scope === 'file' ? files : global;
      if (value === null) {
        if (Object.hasOwn(dictionary, key)) {
          delete dictionary[key];
          changed++;
          changedScopes.add(scope);
        }
      } else if (dictionary[key] !== value) {
        dictionary[key] = value;
        changed++;
        changedScopes.add(scope);
      }
    }
    for (const [scope, dictionary] of [
      ['global', global],
      ['file', files],
    ] as const) {
      if (!changedScopes.has(scope)) continue;
      await writeManualLocale(
        project.i18n_directory,
        input.locale,
        scope,
        dictionary,
      );
    }
    return { changed_count: changed, rebuild_required: true };
  });
}
