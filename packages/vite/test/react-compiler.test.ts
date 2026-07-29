import path from 'node:path';
import babel from '@rolldown/plugin-babel';
import reactPlugin, { reactCompilerPreset } from '@vitejs/plugin-react';
import { expect, test } from 'vitest';
import { build, type Plugin } from 'vite';
import { buildOutputItems } from './build-output';

const RUNNER_ENTRY = 'virtual:react-compiler-runner';
const REACT_ADAPTER = 'virtual:react-adapter-source';

test('invalidates React Compiler caches when the language changes', async () => {
  const fixtureRoot = path.resolve(
    'packages/vite/test/.react-compiler-fixture',
  );
  const runnerId = path.join(fixtureRoot, 'runner.js');
  const componentId = path.join(fixtureRoot, 'component.js');
  const reactMockId = path.join(fixtureRoot, 'react-mock.js');
  const compilerRuntimeMockId = path.join(
    fixtureRoot,
    'compiler-runtime-mock.js',
  );
  const reactAdapterId = path.resolve('packages/vite/src/react.ts');

  const fixturePlugin: Plugin = {
    name: 'ai-i18n:react-compiler-fixture',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === RUNNER_ENTRY) return runnerId;
      if (id === './component.js' && importer === runnerId) return componentId;
      if (id === REACT_ADAPTER) return reactAdapterId;
    },
    load(id) {
      if (id === runnerId) {
        return `
import { App, setLang } from './component.js'
import { getCompilerCalls } from 'react/compiler-runtime'

export async function run() {
  const before = App()
  await setLang('en-US')
  const after = App()
  return { before, after, compilerCalls: getCompilerCalls() }
}
`;
      }
      if (id === componentId) {
        return `
import { createReactI18n } from '${REACT_ADAPTER}'

let lang = 'zh-CN'
const listeners = new Set()
const runtime = {
  t: (source) => lang === 'zh-CN' ? source : 'Title',
  setLang: async (next) => {
    lang = next
    listeners.forEach((listener) => listener())
  },
  getLang: () => lang,
  getLangs: () => [],
  getLangLoadState: () => ({ status: 'idle', targetLang: null, error: null }),
  subscribe: (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
const useI18n = createReactI18n(runtime)

export function App() {
  'use memo'
  const { t } = useI18n()
  return t('标题')
}

export const setLang = runtime.setLang
`;
      }
      if (id === reactMockId) {
        return `
let callback
let dependencies

export function useCallback(next, nextDependencies) {
  const changed = !dependencies
    || nextDependencies.length !== dependencies.length
    || nextDependencies.some(
      (value, index) => !Object.is(value, dependencies[index]),
    )
  if (changed) {
    callback = next
    dependencies = [...nextDependencies]
  }
  return callback
}

export function useSyncExternalStore(subscribe, getSnapshot) {
  return getSnapshot()
}
`;
      }
      if (id === compilerRuntimeMockId) {
        return `
const sentinel = Symbol.for('react.memo_cache_sentinel')
const cache = []
let calls = 0

export function c(size) {
  calls += 1
  while (cache.length < size) cache.push(sentinel)
  return cache
}

export function getCompilerCalls() {
  return calls
}
`;
      }
    },
  };

  const output = await build({
    root: fixtureRoot,
    configFile: false,
    logLevel: 'silent',
    resolve: {
      // 使用持久 cache 模拟 Compiler Runtime，才能验证 t 引用是否真正让缓存失效。
      alias: [
        {
          find: 'react/compiler-runtime',
          replacement: compilerRuntimeMockId,
        },
        { find: 'react', replacement: reactMockId },
      ],
    },
    plugins: [
      fixturePlugin,
      reactPlugin(),
      babel({
        presets: [
          reactCompilerPreset({
            compilationMode: 'annotation',
          }),
        ],
      }),
    ],
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: RUNNER_ENTRY,
        preserveEntrySignatures: 'exports-only',
        output: { format: 'es' },
      },
    },
  });
  const chunk = buildOutputItems(output).find(
    (item) => item.type === 'chunk' && item.exports.includes('run'),
  );
  if (!chunk || chunk.type !== 'chunk') {
    throw new TypeError('Expected the React Compiler fixture entry chunk.');
  }

  const fixtureModule = (await import(
    /* @vite-ignore */
    `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`
  )) as {
    run(): Promise<{
      before: string;
      after: string;
      compilerCalls: number;
    }>;
  };

  await expect(fixtureModule.run()).resolves.toEqual({
    before: '标题',
    after: 'Title',
    compilerCalls: 2,
  });
});
