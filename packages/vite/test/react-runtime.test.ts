import { createI18nRuntime } from '@ai-i18n/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReactI18n } from '../src/react';

const reactHooks = vi.hoisted(() => ({
  callback: undefined as unknown,
  dependencies: undefined as readonly unknown[] | undefined,
  subscribe: undefined as ((listener: () => void) => () => unknown) | undefined,
}));

vi.mock('react', () => ({
  useCallback<T>(callback: T, dependencies: readonly unknown[]): T {
    const changed =
      !reactHooks.dependencies ||
      dependencies.length !== reactHooks.dependencies.length ||
      dependencies.some(
        (value, index) => !Object.is(value, reactHooks.dependencies?.[index]),
      );
    if (changed) {
      reactHooks.callback = callback;
      reactHooks.dependencies = [...dependencies];
    }
    return reactHooks.callback as T;
  },
  useSyncExternalStore<T>(
    subscribe: (listener: () => void) => () => unknown,
    getSnapshot: () => T,
  ): T {
    reactHooks.subscribe = subscribe;
    return getSnapshot();
  },
}));

beforeEach(() => {
  reactHooks.callback = undefined;
  reactHooks.dependencies = undefined;
  reactHooks.subscribe = undefined;
});

describe('React runtime adapter', () => {
  it('subscribes to Core updates and invalidates cached translations', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('App.tsx', {
      'zh-CN': { 标题: '标题' },
      'en-US': { 标题: 'Title' },
    });
    const useI18n = createReactI18n(runtime);
    const first = useI18n();
    const listener = vi.fn();
    const unsubscribe = reactHooks.subscribe!(listener);

    expect(first.currentLang).toBe('zh-CN');
    expect(first.t('标题')).toBe('标题');
    await runtime.setLang('en-US');
    expect(listener).toHaveBeenCalledOnce();

    const second = useI18n();
    expect(second.currentLang).toBe('en-US');
    expect(second.t('标题')).toBe('Title');
    expect(second.t).not.toBe(first.t);

    unsubscribe();
    await runtime.setLang('zh-CN');
    expect(listener).toHaveBeenCalledOnce();
  });
});
