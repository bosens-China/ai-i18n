import { expect, test, vi } from 'vitest';
import { loadRegistration } from '../src/registration-loader';
import type { FileStore } from '../src/file-store';
import type { ProjectState } from '../src/project-state';

test('registration watches Windows dependency paths without loading the dependency graph', async () => {
  const addWatchFile = vi.fn();
  const project = {
    registrationWatchFiles: () => [
      String.raw`E:\DropRoom\apps\web\src\page.ts`,
      String.raw`E:\DropRoom\apps\web\src\utils\roomRegistry.ts`,
    ],
    registrationLoadFiles: () => [],
    registration: () => null,
  } as unknown as ProjectState;
  const store = {
    watchFiles: () => [
      String.raw`E:\DropRoom\apps\web\i18n\translations\en-US\ab\translation.json`,
    ],
  } as unknown as FileStore;

  const load = vi.fn();
  await expect(
    loadRegistration(
      { addWatchFile, load },
      {
        moduleId: 'src/page.ts',
        build: false,
        project,
        store,
        flush: vi.fn(),
        watchFileExists: async () => true,
      },
    ),
  ).resolves.toBe('export {}');
  expect(addWatchFile.mock.calls.flat()).toEqual([
    String.raw`E:\DropRoom\apps\web\src\page.ts`,
    String.raw`E:\DropRoom\apps\web\src\utils\roomRegistry.ts`,
    String.raw`E:\DropRoom\apps\web\i18n\translations\en-US\ab\translation.json`,
  ]);
  expect(load).not.toHaveBeenCalled();
});

test('registration skips generated watch files that background persistence has not created yet', async () => {
  const addWatchFile = vi.fn();
  const project = {
    registrationWatchFiles: () => ['/project/src/page.ts'],
    registrationLoadFiles: () => [],
    registration: () => ({ zh: { message: '文案' } }),
  } as unknown as ProjectState;
  const store = {
    watchFiles: () => [
      '/project/i18n/overrides/en-US/ab/override.json',
      '/project/i18n/extracted/missing.json',
    ],
  } as unknown as FileStore;

  await expect(
    loadRegistration(
      { addWatchFile, load: vi.fn() },
      {
        moduleId: 'src/page.ts',
        build: false,
        project,
        store,
        flush: vi.fn(),
        watchFileExists: async (file) => !file.endsWith('missing.json'),
      },
    ),
  ).resolves.toContain('__registerModule');
  expect(addWatchFile.mock.calls.flat()).toEqual([
    '/project/src/page.ts',
    '/project/i18n/overrides/en-US/ab/override.json',
  ]);
});
