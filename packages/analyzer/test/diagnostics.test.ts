import { describe, expect, it, vi } from 'vitest';
import {
  diagnosticMessage,
  resolveDiagnosticLocale,
} from '../src/diagnostics.js';

describe('diagnostic locale', () => {
  it('uses an explicit locale before the time zone', () => {
    expect(resolveDiagnosticLocale('en-US', 'Asia/Shanghai')).toBe('en-US');
    expect(resolveDiagnosticLocale('zh-CN', 'UTC')).toBe('zh-CN');
  });

  it('uses Chinese only for mainland China time zones', () => {
    expect(resolveDiagnosticLocale('auto', 'Asia/Shanghai')).toBe('zh-CN');
    expect(resolveDiagnosticLocale('auto', 'Asia/Urumqi')).toBe('zh-CN');
    expect(resolveDiagnosticLocale('auto', 'Asia/Singapore')).toBe('en-US');
  });

  it('rejects unsupported overrides', () => {
    expect(() => resolveDiagnosticLocale('fr-FR', 'UTC')).toThrow(
      'Unsupported AI_I18N_DIAGNOSTIC_LOCALE',
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
