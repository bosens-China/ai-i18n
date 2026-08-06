import { diagnosticMessage } from '@ai-i18n/analyzer';

export function ssrWarningMessage(
  action: 'injection' | 'transformation',
): string {
  const actionZh = action === 'injection' ? '注入' : '转换';
  const actionEn = action === 'injection' ? 'injection' : 'transformation';
  const vitest = isVitest();
  const vitestZh = vitest
    ? ' Vitest 中请使用 @ai-i18n/vite/vitest 的 aiI18nVitest()。'
    : '';
  const vitestEn = vitest
    ? ' In Vitest, use aiI18nVitest() from @ai-i18n/vite/vitest.'
    : '';
  return diagnosticMessage(
    `[ai-i18n] 仅支持浏览器 Runtime；已跳过 SSR ${actionZh}。${vitestZh}`,
    `[ai-i18n] Browser runtime only; skipped SSR ${actionEn}.${vitestEn}`,
  );
}

function isVitest(): boolean {
  return process.env.VITEST === 'true' || process.env.VITEST === '1';
}
