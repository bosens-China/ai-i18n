import { expect, it } from 'vitest';
import { normalizeOptions } from '../src/plugin-utils';

const base = {
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};

it.each([undefined, false])('keeps loading disabled for %s', (loading) => {
  expect(normalizeOptions({ ...base, loading }).loading).toBeUndefined();
});

it.each([true, {}])('enables loading with default hints for %j', (loading) => {
  expect(normalizeOptions({ ...base, loading }).loading).toEqual({
    preload: [],
    prefetch: [],
  });
  expect(
    normalizeOptions({ ...base, defaultLang: 'en-US', loading }).loading,
  ).toEqual({ preload: ['en-US'], prefetch: [] });
});
