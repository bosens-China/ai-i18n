import path from 'node:path';
import { createMessageId, hasSameTemplateTokens } from '@ai-i18n/core';
import type { LangOption, ReviewMessage, ReviewSnapshot } from '@ai-i18n/core';
import { readJson } from './json-files.js';
import { readManualLocale, writeManualLocale } from './manual-translations.js';
import { fileId, fileMessageKey } from './repository-paths.js';
import { ReviewProblem } from './review-problem.js';
import type {
  ReviewOverrideTarget,
  ReviewOverrideUpdate,
  ReviewService,
} from './review-service.js';
import type { ProjectState } from './project-state.js';
import type { FileStore } from './file-store.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';

interface Options {
  sourceLang: string;
  locales: readonly LangOption[];
  ready(): Promise<void>;
  ensureCatalog?(full: boolean): Promise<void>;
  refreshTarget?(target: ReviewOverrideTarget): Promise<void>;
  state(): ProjectState;
  store(): FileStore;
  runStateTask: DevStateTaskRunner;
}

function problem(code: string, zh: string, en: string): ReviewProblem {
  return new ReviewProblem(code, 400, zh, en);
}

async function generated(file: string): Promise<Record<string, string>> {
  const value = await readJson(file);
  if (value === undefined) return {};
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.values(value).some((item) => typeof item !== 'string')
  )
    throw problem(
      'INVALID_LOCALE_JSON',
      `生成资源“${file}”必须是 key→value 对象。`,
      `Generated locale "${file}" must be a key-value object.`,
    );
  return value as Record<string, string>;
}

export function createRepositoryReviewService(options: Options): ReviewService {
  const targetLocales = options.locales.filter(
    (locale) => locale.value !== options.sourceLang,
  );
  function activeFiles() {
    const snapshot = options.state().snapshot();
    const persisted = options.store().repository!.loadExtracted();
    return [
      ...persisted.filter((file) => !snapshot.seen.includes(file.source)),
      ...Object.values(snapshot.extracted),
    ];
  }

  async function snapshot(full = false): Promise<ReviewSnapshot> {
    await options.ready();
    await options.ensureCatalog?.(full);
    const files = activeFiles();
    const root = options.state().root;
    const messages = new Map<string, ReviewMessage>();
    for (const file of files) {
      for (const message of file.messages) {
        const item: ReviewMessage = messages.get(message.id) ?? {
          message: {
            source: message.source,
            ...(message.comment ? { comment: message.comment } : {}),
          },
          translations: {},
          overrides: [],
          occurrences: [],
          fileTranslations: {},
        };
        let occurrence = item.occurrences.find(
          (candidate) => candidate.sourceFile === file.source,
        );
        if (!occurrence) {
          occurrence = {
            sourceFile: file.source,
            locations: [],
            fileScoped: false,
          };
          item.occurrences.push(occurrence);
        }
        occurrence.locations.push(...message.locations);
        if (message.scope === 'file') occurrence.fileScoped = true;
        messages.set(message.id, item);
      }
    }
    const directory = options.store().directory;
    const localesDir = path.join(directory, 'locales');
    const manifest = await generated(
      path.join(localesDir, 'files', 'manifest.json'),
    );
    for (const locale of targetLocales) {
      const [global, globalManual, fileManual] = await Promise.all([
        generated(
          path.join(localesDir, `${encodeURIComponent(locale.value)}.json`),
        ),
        readManualLocale(directory, locale.value, 'global'),
        readManualLocale(directory, locale.value, 'file'),
      ]);
      const packets = new Map<string, Record<string, string>>();
      for (const [key, item] of messages) {
        item.translations[locale.value] = Object.hasOwn(global, key)
          ? global[key]!
          : null;
        if (Object.hasOwn(globalManual, key))
          item.overrides.push({
            locale: locale.value,
            value: globalManual[key]!,
          });
        for (const occurrence of item.occurrences) {
          if (!occurrence.fileScoped) continue;
          const id = fileId(root, path.resolve(root, occurrence.sourceFile));
          const fileKey = fileMessageKey(id, key);
          const group = manifest[id];
          let packet: Record<string, string> = {};
          if (group && /^[a-f0-9]{12}$/.test(group)) {
            packet =
              packets.get(group) ??
              (await generated(
                path.join(
                  localesDir,
                  'files',
                  encodeURIComponent(locale.value),
                  `${group}.json`,
                ),
              ));
            packets.set(group, packet);
          }
          (item.fileTranslations ??= {})[occurrence.sourceFile] ??= {};
          item.fileTranslations[occurrence.sourceFile]![locale.value] =
            (Object.hasOwn(packet, fileKey) ? packet[fileKey] : undefined) ??
            (Object.hasOwn(global, key) ? global[key] : undefined) ??
            null;
          if (Object.hasOwn(fileManual, fileKey))
            item.overrides.push({
              locale: locale.value,
              file: occurrence.sourceFile,
              value: fileManual[fileKey]!,
            });
        }
      }
    }
    return {
      sourceLang: options.sourceLang,
      locales: targetLocales.map((locale) => ({ ...locale })),
      messages: [...messages.values()].sort((a, b) =>
        createMessageId(a.message.source, a.message).localeCompare(
          createMessageId(b.message.source, b.message),
        ),
      ),
    };
  }

  async function mutate(
    target: ReviewOverrideTarget,
    value: string | undefined,
  ) {
    await options.ready();
    await options.ensureCatalog?.(false);
    await options.refreshTarget?.(target);
    return options.runStateTask(async () => {
      if (target.location)
        throw problem(
          'UNSUPPORTED_SCOPE',
          '新作用范围只支持全局或文件，不支持单个出现位置。',
          'The new scope supports global or file translations, not individual occurrences.',
        );
      if (!targetLocales.some((locale) => locale.value === target.locale))
        throw problem(
          'UNKNOWN_LOCALE',
          '目标语言不存在。',
          'Unknown target locale.',
        );
      if (
        value !== undefined &&
        !hasSameTemplateTokens(target.message.source, value)
      )
        throw problem(
          'TEMPLATE_TOKEN_MISMATCH',
          '人工译文必须保留原文中的全部模板占位符。',
          'The reviewed translation must preserve every template token from the source.',
        );
      const key = createMessageId(target.message.source, target.message);
      const files = activeFiles();
      const found = files.some(
        (file) =>
          (!target.file || file.source === target.file) &&
          file.messages.some(
            (message) =>
              message.id === key && (!target.file || message.scope === 'file'),
          ),
      );
      if (!found)
        throw problem(
          'UNKNOWN_MESSAGE',
          '目标文案或文件范围已不存在，请重新扫描后重试。',
          'The message or file scope is no longer active. Scan again and retry.',
        );
      const scope = target.file ? 'file' : 'global';
      const manualKey = target.file
        ? fileMessageKey(
            fileId(
              options.state().root,
              path.resolve(options.state().root, target.file),
            ),
            key,
          )
        : key;
      const directory = options.store().directory;
      const current = await readManualLocale(directory, target.locale, scope);
      const changed =
        value === undefined
          ? Object.hasOwn(current, manualKey)
          : current[manualKey] !== value;
      if (!changed) return { changed: false, affectedModuleCount: 0 };
      if (value === undefined) delete current[manualKey];
      else current[manualKey] = value;
      await writeManualLocale(directory, target.locale, scope, current);
      return { changed: true, affectedModuleCount: 0 };
    });
  }

  return {
    snapshot,
    setOverride: (update: ReviewOverrideUpdate) => mutate(update, update.value),
    deleteOverride: (target: ReviewOverrideTarget) => mutate(target, undefined),
  };
}
