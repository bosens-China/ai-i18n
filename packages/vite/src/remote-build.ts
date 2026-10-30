import { randomUUID } from 'node:crypto';
import MagicString from 'magic-string';
import { runtimeMessageId, formatTemplateMessage } from '@ai-i18n/core';
import { htmlBindingKey } from './html.js';
import type { ExtractedMessage } from './yuku-analyzer.js';
import type { ProjectState } from './project-state.js';
import type { TranslationMeta } from './runtime.js';

export function createRemoteBuildValues(
  project: () => ProjectState,
  meta: () => TranslationMeta | undefined,
) {
  const prefix = `__AI_I18N_REMOTE_${randomUUID().replaceAll('-', '')}_`;
  const values = new Map<string, () => unknown>();
  const modules = new Map<string, string>();
  const placeholder = (read: () => unknown) => {
    const marker = `${prefix}${values.size}__`;
    values.set(marker, read);
    return marker;
  };
  const metaMarker = placeholder(meta);
  return {
    meta: JSON.stringify(metaMarker),
    registration(moduleId: string, locale?: string) {
      const key = JSON.stringify([moduleId, locale]);
      let marker = modules.get(key);
      if (!marker) {
        marker = placeholder(
          () => project().registration(moduleId, locale) ?? {},
        );
        modules.set(key, marker);
      }
      return marker;
    },
    htmlValues(moduleId: string, messages: readonly ExtractedMessage[]) {
      const state = project();
      const locale = state.options.loading
        ? state.options.sourceLang
        : state.options.defaultLang;
      return Object.fromEntries(
        messages.flatMap((message) =>
          message.locations.map((location) => {
            const occurrence = `${location.line}:${location.column}`;
            return [
              htmlBindingKey(message.id, occurrence),
              placeholder(() =>
                formatTemplateMessage(
                  project().registration(moduleId)?.[locale]?.[
                    runtimeMessageId(moduleId, message.id, occurrence)
                  ] ?? message.source,
                  [],
                ),
              ),
            ];
          }),
        ),
      );
    },
    render(code: string, filename: string) {
      const transformed = new MagicString(code);
      const pattern = new RegExp(`(["'\x60])(${prefix}\\d+__)\\1`, 'g');
      for (const match of code.matchAll(pattern)) {
        const value = values.get(match[2]!)?.();
        const json =
          JSON.stringify(value)
            ?.replaceAll('<', '\\u003c')
            .replaceAll('\u2028', '\\u2028')
            .replaceAll('\u2029', '\\u2029') ?? 'undefined';
        // 元数据是任意 JSON；用 JSON.parse 保留 __proto__ 等普通数据键的语义。
        const expression =
          match[2] === metaMarker && value !== undefined
            ? `JSON.parse(${JSON.stringify(json)})`
            : json;
        transformed.overwrite(
          match.index,
          match.index + match[0].length,
          expression,
        );
      }
      return transformed.hasChanged()
        ? {
            code: transformed.toString(),
            map: transformed.generateMap({ source: filename, hires: true }),
          }
        : null;
    },
    renderHtml(source: string) {
      return source.replace(new RegExp(`${prefix}\\d+__`, 'g'), (marker) => {
        const value = values.get(marker)?.();
        // HTML 文本和属性共用安全转义，不能把远程译文作为标签注入。
        return String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      });
    },
  };
}

export type RemoteBuildValues = ReturnType<typeof createRemoteBuildValues>;
