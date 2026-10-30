import { describe, expect, it } from 'vitest';
import {
  validateRemote,
  validateRemoteSnapshot,
} from '../src/remote-validation';
import { createTranslationMetaState } from '../src/runtime-meta';
import type { RemoteContext } from '../src/remote';

const context: RemoteContext = {
  command: 'build',
  sourceLang: 'zh-CN',
  locales: ['en-US'],
  messages: [
    { source: '保存', occurrences: [] },
    { source: '你好 {{0}}', comment: '问候', occurrences: [] },
  ],
  signal: new AbortController().signal,
};
const entry = { message: { source: '保存' }, locale: 'en-US', value: 'Save' };

describe('remote snapshot boundaries', () => {
  it('validates configuration and permits publish with a provider', () => {
    expect(() => validateRemote({ publish: async () => {} }, {})).not.toThrow();
    expect(() =>
      validateRemote({ load: async () => ({ translations: [] }) }, {}),
    ).toThrow(/remote.load/);
    expect(() => validateRemote({}, undefined)).toThrow(/remote/);
    expect(() =>
      validateRemote({ mode: 'overlay', publish: async () => {} }, undefined),
    ).toThrow(/load/);
    expect(() =>
      validateRemote(
        { mode: 'unknown', load: async () => ({ translations: [] }) } as never,
        undefined,
      ),
    ).toThrow(/mode/);
  });

  it('fills missing targets with null and preserves empty translations and comments', () => {
    const snapshot = validateRemoteSnapshot(
      {
        translations: [{ ...entry, value: '' }],
        publicMeta: { version: 'v1' },
      },
      context,
    );
    expect(snapshot.cache.messages['保存']?.translations['en-US']).toBe('');
    expect(
      snapshot.cache.messages['你好 {{0}}#问候']?.translations['en-US'],
    ).toBeNull();
    expect(snapshot.publicMeta).toEqual({ version: 'v1' });
  });

  it.each(
    [
      [{ ...entry, locale: 'unknown' }],
      [{ ...entry, message: { source: '未知' } }],
      [
        {
          ...entry,
          message: { source: '你好 {{0}}', comment: '问候' },
          value: 'Hello',
        },
      ],
      [entry, { ...entry, value: 'Other' }],
      [{ ...entry, value: 123 }],
    ].map((translations) => ({ translations })),
  )('rejects the whole invalid snapshot: %j', ({ translations }) => {
    expect(() => validateRemoteSnapshot({ translations }, context)).toThrow();
  });

  it('permits duplicate identical results but rejects non-JSON metadata', () => {
    expect(() =>
      validateRemoteSnapshot({ translations: [entry, entry] }, context),
    ).not.toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const publicMeta of [
      circular,
      { version: NaN },
      { version: undefined },
      { now: new Date() },
      { fn() {} },
    ]) {
      expect(() =>
        validateRemoteSnapshot({ translations: [], publicMeta }, context),
      ).toThrow(/publicMeta/);
    }
  });

  it('does not expose mutable metadata or retain stale metadata after replacement', () => {
    const metadata = createTranslationMetaState({
      version: 'v1',
      nested: { revision: 1 },
    });
    expect(Object.isFrozen(metadata.get())).toBe(true);
    expect(Object.isFrozen(metadata.get()?.nested)).toBe(true);
    metadata.replace(undefined);
    expect(metadata.get()).toBeUndefined();
  });
});
