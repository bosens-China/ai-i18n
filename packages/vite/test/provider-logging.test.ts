import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveProviderLogging } from '../src/provider-logging';

describe('provider logging options', () => {
  const root = path.resolve('/workspace/apps/example');

  it('keeps logging disabled unless explicitly enabled', () => {
    expect(resolveProviderLogging(undefined, root)).toBe(false);
    expect(resolveProviderLogging(false, root)).toBe(false);
  });

  it('resolves true and relative directories from the Vite root', () => {
    expect(resolveProviderLogging(true, root)).toBe(path.join(root, 'logs'));
    expect(resolveProviderLogging('diagnostics/llm', root)).toBe(
      path.join(root, 'diagnostics/llm'),
    );
  });

  it('preserves absolute directories', () => {
    const directory = path.resolve('/tmp/ai-i18n-logs');
    expect(resolveProviderLogging(directory, root)).toBe(directory);
  });

  it('rejects an empty string with localized diagnostics', () => {
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
    expect(() => resolveProviderLogging('  ', root)).toThrow(
      'provider.logging 作为字符串时不能为空',
    );
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'en-US');
    expect(() => resolveProviderLogging('', root)).toThrow(
      'provider.logging must not be empty',
    );
    vi.unstubAllEnvs();
  });
});
