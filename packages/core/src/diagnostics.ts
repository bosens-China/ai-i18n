export type DiagnosticLocale = 'zh-CN' | 'en-US';

const CHINESE_TIME_ZONES = new Set(['Asia/Shanghai', 'Asia/Urumqi']);
const ENV_NAME = 'AI_I18N_DIAGNOSTIC_LOCALE';

export function resolveDiagnosticLocale(
  value = typeof process === 'undefined' ? undefined : process.env[ENV_NAME],
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): DiagnosticLocale {
  const automaticLocale = CHINESE_TIME_ZONES.has(timeZone) ? 'zh-CN' : 'en-US';
  if (!value || value === 'auto') return automaticLocale;
  if (value === 'zh-CN' || value === 'en-US') return value;
  throw new Error(
    automaticLocale === 'zh-CN'
      ? `[ai-i18n] 不支持 ${ENV_NAME}“${value}”；应为“auto”“zh-CN”或“en-US”。`
      : `[ai-i18n] Unsupported ${ENV_NAME} "${value}"; expected "auto", "zh-CN", or "en-US".`,
  );
}

export function diagnosticMessage(chinese: string, english: string): string {
  return resolveDiagnosticLocale() === 'zh-CN' ? chinese : english;
}
