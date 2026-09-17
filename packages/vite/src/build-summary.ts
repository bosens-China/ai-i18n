import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { ProjectState } from './project-state.js';

export function summarizeProject(project: ProjectState) {
  const messages = new Set<string>();
  const missing = new Map<string, Set<string>>();
  let fileCount = 0;
  for (const [moduleId, result] of project.modules) {
    if (result.messages.length) fileCount++;
    for (const message of result.messages) messages.add(message.id);
    // 使用只读缺译查询，不能消费 Provider 请求去重状态。
    for (const request of project.missingTranslations(moduleId)) {
      for (const locale of request.locales) {
        const ids = missing.get(locale) ?? new Set<string>();
        ids.add(request.messageId);
        missing.set(locale, ids);
      }
    }
  }
  return {
    file_count: fileCount,
    message_count: messages.size,
    locales: project.options.locales
      .filter(({ value }) => value !== project.options.sourceLang)
      .map(({ value }) => ({
        locale: value,
        translated: messages.size - (missing.get(value)?.size ?? 0),
        missing: missing.get(value)?.size ?? 0,
      })),
  };
}

export function formatBuildSummary(
  summary: ReturnType<typeof summarizeProject>,
): string {
  return diagnosticMessage(
    `[ai-i18n] 构建文案：${summary.message_count} 条，${summary.file_count} 个文件（含人工覆盖）\n${summary.locales.map((locale) => `  ${locale.locale}  已翻译 ${locale.translated}，未翻译 ${locale.missing}`).join('\n')}`,
    `[ai-i18n] Build messages: ${summary.message_count} across ${summary.file_count} files (including overrides)\n${summary.locales.map((locale) => `  ${locale.locale}  translated ${locale.translated}, missing ${locale.missing}`).join('\n')}`,
  ).trimEnd();
}
