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
    watchFiles: () => [String.raw`E:\DropRoom\apps\web\i18n\translations.json`],
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
      },
    ),
  ).resolves.toBe('export {}');
  expect(addWatchFile.mock.calls.flat()).toEqual([
    String.raw`E:\DropRoom\apps\web\src\page.ts`,
    String.raw`E:\DropRoom\apps\web\src\utils\roomRegistry.ts`,
    String.raw`E:\DropRoom\apps\web\i18n\translations.json`,
  ]);
  expect(load).not.toHaveBeenCalled();
});
