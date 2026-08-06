import { afterEach, expect, test, vi } from 'vitest';
import { ssrWarningMessage } from '../src/ssr-warning';

afterEach(() => vi.unstubAllEnvs());

test('adds the Vitest adapter action only in Vitest environments', () => {
  vi.stubEnv('VITEST', 'true');
  expect(ssrWarningMessage('transformation')).toContain('aiI18nVitest()');

  vi.stubEnv('VITEST', 'false');
  expect(ssrWarningMessage('injection')).not.toContain('aiI18nVitest()');
});
