import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { translationMemoryEntryPath } from '@ai-i18n/core/translation-memory';
import { extractedPath } from './file-store-paths.js';
import type { ProjectState } from './project-state.js';
import { summarizeProject } from './build-summary.js';

export function assertBuildTranslations(
  project: ProjectState,
  directory: string,
  remote = false,
): void {
  const missing = summarizeProject(project).locales.filter(
    (locale) => locale.missing,
  );
  if (!missing.length) return;
  const counts = missing
    .map(({ locale, missing }) => `${locale}: ${missing}`)
    .join(', ');
  const details: string[] = [];
  for (const [file, result] of project.modules) {
    for (const request of project.missingTranslations(file)) {
      const location = result.messages.find(
        (message) => message.id === request.messageId,
      )?.locations[0];
      details.push(
        `${path.resolve(project.root, file)}${location ? `:${location.line}:${location.column + 1}` : ''} [${request.locales.join(', ')}] ${JSON.stringify(request.source)}`,
        `  ID: ${request.messageId}`,
      );
      if (remote) {
        details.push(
          diagnosticMessage(
            '  译文来自远程，无本地 translations JSON；请检查远程数据或人工覆盖。',
            '  Translations come from a remote source; no local translations JSON. Check remote data or reviewed overrides.',
          ),
        );
      } else {
        for (const locale of request.locales) {
          details.push(
            `  ${locale} JSON: ${translationMemoryEntryPath(
              path.join(directory, 'translations'),
              {
                sourceLang: project.options.sourceLang,
                source: request.source,
                comment: request.comment,
                locale,
              },
            )}`,
          );
        }
      }
      details.push(
        diagnosticMessage(
          `  提取 JSON: ${extractedPath(directory, file)}`,
          `  Extracted JSON: ${extractedPath(directory, file)}`,
        ),
      );
    }
  }
  throw new Error(
    diagnosticMessage(
      `[ai-i18n] 构建失败：存在未翻译文案（${counts}）。\n${details.join('\n')}\n完整缺译清单可通过 MCP 查询：${directory}`,
      `[ai-i18n] Build failed: missing translations (${counts}).\n${details.join('\n')}\nQuery the complete missing catalog with MCP: ${directory}`,
    ),
  );
}
