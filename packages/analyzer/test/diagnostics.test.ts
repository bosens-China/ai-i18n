import { describe, expect, it, vi } from 'vitest';
import {
  diagnosticMessage,
  resolveDiagnosticLocale,
} from '../src/diagnostics.js';

describe('diagnostic locale', () => {
  it('uses an explicit locale before the runtime locale', () => {
    expect(resolveDiagnosticLocale('en-US', 'zh-CN')).toBe('en-US');
    expect(resolveDiagnosticLocale('zh-CN', 'en-US')).toBe('zh-CN');
  });

  it('uses the current locale and falls back to English', () => {
    expect(resolveDiagnosticLocale('auto', 'zh-CN')).toBe('zh-CN');
    expect(resolveDiagnosticLocale('auto', 'zh-TW')).toBe('zh-CN');
    expect(resolveDiagnosticLocale('auto', 'en-GB')).toBe('en-US');
    expect(resolveDiagnosticLocale('auto', 'ja-JP')).toBe('en-US');
  });

  it('rejects unsupported overrides', () => {
    expect(() => resolveDiagnosticLocale('fr-FR', 'en-US')).toThrow(
      'Unsupported AI_I18N_DIAGNOSTIC_LOCALE',
    );
    expect(() => resolveDiagnosticLocale('fr-FR', 'zh-CN')).toThrow(
      '不支持 AI_I18N_DIAGNOSTIC_LOCALE',
    );
  });

  it('formats both supported languages', () => {
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
    expect(diagnosticMessage('中文', 'English')).toBe('中文');
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'en-US');
    expect(diagnosticMessage('中文', 'English')).toBe('English');
    vi.unstubAllEnvs();
  });
});
