import { describe, expect, it } from 'vitest';
import {
  atomicOverrides,
  overridesFromAtomic,
  resolveTranslationOverride,
  type TranslationOverridesFile,
} from '../src/index';

const overrides: TranslationOverridesFile = {
  version: 2,
  rules: [
    { source: '保存', translations: { 'en-US': 'Save globally' } },
    {
      source: '保存',
      comment: 'button',
      translations: { 'en-US': 'Save button globally' },
    },
    {
      source: '保存',
      files: ['src/app.ts'],
      translations: { 'en-US': 'Save file' },
    },
    {
      source: '保存',
      occurrences: [{ file: 'src/app.ts', line: 3, column: 8 }],
      translations: { 'en-US': 'Save first' },
    },
    {
      source: '保存',
      occurrences: [{ file: 'src/app.ts', line: 3, column: 25 }],
      translations: { 'en-US': 'Save second' },
    },
  ],
};

describe('translation overrides', () => {
  it('prefers occurrence, then file, then global scope', () => {
    const message = { id: '保存#button', source: '保存', comment: 'button' };

    expect(
      resolveTranslationOverride(overrides, message, 'en-US', 'src/app.ts', {
        line: 3,
        column: 8,
      }),
    ).toBe('Save first');
    expect(
      resolveTranslationOverride(overrides, message, 'en-US', 'src/app.ts', {
        line: 3,
        column: 25,
      }),
    ).toBe('Save second');
    expect(
      resolveTranslationOverride(overrides, message, 'en-US', 'src/app.ts', {
        line: 4,
        column: 0,
      }),
    ).toBe('Save file');
    expect(
      resolveTranslationOverride(overrides, message, 'en-US', 'src/other.ts', {
        line: 3,
        column: 8,
      }),
    ).toBe('Save button globally');
  });

  it('round-trips occurrence-scoped atomic overrides', () => {
    const atomic = atomicOverrides(overrides);
    const roundTrip = overridesFromAtomic(atomic.values());

    expect(atomic.size).toBe(5);
    expect(roundTrip).toEqual(
      overridesFromAtomic(atomicOverrides(roundTrip).values()),
    );
    expect(
      [...atomic.values()].find(
        (entry) => entry.file === 'src/app.ts' && entry.location?.column === 25,
      )?.value,
    ).toBe('Save second');
  });
});
