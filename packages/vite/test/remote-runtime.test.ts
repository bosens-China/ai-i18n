import { expect, it, vi } from 'vitest';
import * as dependencies from '../src/runtime';
import { runtimeCode } from '../src/virtual-modules';
import { REMOTE_UPDATE_EVENT } from '../src/plugin-remote';
import { options } from './plugin-test-utils';
import { createRemoteBuildValues } from '../src/remote-build';
import { ProjectState } from '../src/project-state';
import { REMOTE_READY_EVENT } from '../src/remote-updates';

it('preserves JSON metadata keys without changing browser object prototypes', () => {
  const project = new ProjectState('/workspace', options);
  const meta = JSON.parse('{"__proto__":{"inherited":true},"version":"v1"}');
  const values = createRemoteBuildValues(
    () => project,
    () => meta,
  );
  const output = values.render(
    `const metadata = ${values.meta};`,
    'runtime.js',
  )!;
  const actual = new Function(`${output.code}; return metadata;`)();
  expect(Object.hasOwn(actual, '__proto__')).toBe(true);
  expect(actual.inherited).toBeUndefined();
  expect(actual).toEqual(meta);
});

it('exposes applied metadata in the browser runtime and updates it with translations', () => {
  const handlers = new Map<string, (value: unknown) => void>();
  const code = runtimeCode(
    options,
    'translations',
    'locales',
    'vanilla',
    false,
    '/',
    '{"version":"initial"}',
    true,
  )
    .replace(
      /import \{([^}]+)\} from '@ai-i18n\/vite\/runtime';/,
      'const {$1} = dependencies;',
    )
    .replaceAll('export const ', 'const ')
    .replaceAll('import.meta.hot', 'hot');
  const runtime = new Function(
    'dependencies',
    'hot',
    `${code}
    return { getTranslationMeta, __registerModule, __scope };`,
  )(dependencies, {
    send: vi.fn(),
    on(event: string, handler: (value: unknown) => void) {
      handlers.set(event, handler);
    },
  });
  const id = dependencies.runtimeMessageId('src/main.ts', '保存');
  runtime.__registerModule('src/main.ts', {
    'zh-CN': { [id]: '保存' },
    'en-US': { [id]: 'Old' },
  });
  expect(runtime.__scope('src/main.ts').t('保存')).toBe('Old');
  handlers.get(REMOTE_UPDATE_EVENT)!({
    publicMeta: { version: 'new' },
    locales: {},
    modules: {
      'src/main.ts': { 'zh-CN': { [id]: '保存' }, 'en-US': { [id]: 'New' } },
    },
  });
  expect(runtime.__scope('src/main.ts').t('保存')).toBe('New');
  expect(runtime.getTranslationMeta()).toEqual({ version: 'new' });
  expect(Object.isFrozen(runtime.getTranslationMeta())).toBe(true);
  handlers.get(REMOTE_UPDATE_EVENT)!({ modules: {}, locales: {} });
  expect(runtime.getTranslationMeta()).toBeUndefined();
});

it('retains a replay that arrives before business module registration', () => {
  const handlers = new Map<string, (value: unknown) => void>();
  const send = vi.fn();
  const code = runtimeCode(
    options,
    'translations',
    'locales',
    'vanilla',
    false,
    '/',
    'undefined',
    true,
  )
    .replace(
      /import \{([^}]+)\} from '@ai-i18n\/vite\/runtime';/,
      'const {$1} = dependencies;',
    )
    .replaceAll('export const ', 'const ')
    .replaceAll('import.meta.hot', 'hot');
  const runtime = new Function(
    'dependencies',
    'hot',
    `${code}; return { getTranslationMeta, __registerModule, __scope };`,
  )(dependencies, {
    send,
    on: (event: string, handler: (value: unknown) => void) =>
      handlers.set(event, handler),
  });
  expect(send).toHaveBeenCalledWith(REMOTE_READY_EVENT, {});
  const id = dependencies.runtimeMessageId('src/main.ts', '保存');
  const source = { 'zh-CN': { [id]: '保存' }, 'en-US': { [id]: null } };
  handlers.get(REMOTE_UPDATE_EVENT)!({
    publicMeta: { version: 'ready' },
    locales: {},
    modules: { 'src/main.ts': { ...source, 'en-US': { [id]: 'Replayed' } } },
  });
  runtime.__registerModule('src/main.ts', source);
  expect(runtime.__scope('src/main.ts').t('保存')).toBe('Replayed');
  expect(runtime.getTranslationMeta()).toEqual({ version: 'ready' });
  handlers.get('translations')!({
    moduleId: 'src/main.ts',
    messages: { ...source, 'en-US': { [id]: 'Reviewed' } },
  });
  runtime.__registerModule('src/main.ts', source);
  expect(runtime.__scope('src/main.ts').t('保存')).toBe('Reviewed');
});
