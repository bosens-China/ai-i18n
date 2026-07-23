import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveAutoImport,
  resolveFramework,
  writeFrameworkTypes,
} from '../src/framework';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('framework integration', () => {
  it('detects official Vue and React Vite plugins', () => {
    expect(resolveFramework([{ name: 'vite:vue' }])).toBe('vue');
    expect(resolveFramework([{ name: 'vite:vue-jsx' }])).toBe('vue');
    expect(resolveFramework([{ name: 'vite:react-babel' }])).toBe('react');
    expect(resolveFramework([{ name: 'vite:react-swc' }])).toBe('react');
    expect(resolveFramework([])).toBe('vanilla');
  });

  it('rejects mixed framework plugins', () => {
    expect(() =>
      resolveFramework([{ name: 'vite:vue' }, { name: 'vite:react-babel' }]),
    ).toThrow('cannot be used in the same build');
  });

  it('lets an explicit framework override detection', () => {
    expect(resolveFramework([{ name: 'vite:vue' }], 'vanilla')).toBe('vanilla');
    expect(resolveFramework([{ name: 'vite:react-babel' }], 'vue')).toBe('vue');
  });

  it('detects the host Auto Import plugin and supports forced overrides', () => {
    expect(resolveAutoImport([{ name: 'unplugin-auto-import' }])).toBe(true);
    expect(resolveAutoImport([{ name: 'unplugin-auto-import:dts' }])).toBe(
      true,
    );
    expect(resolveAutoImport([])).toBe(false);
    expect(resolveAutoImport([{ name: 'unplugin-auto-import' }], false)).toBe(
      false,
    );
    expect(resolveAutoImport([], true)).toBe(true);
  });

  it('writes mode-specific virtual and global declarations', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-types-'));
    tempDirs.push(root);

    await writeFrameworkTypes(root, 'vue', true);
    const source = await fs.readFile(
      path.join(root, 'src/ai-i18n.d.ts'),
      'utf8',
    );

    expect(source).toContain("declare module 'virtual:ai-i18n'");
    expect(source).toContain('createVueI18n');
    expect(source).toContain('declare const useI18n');
    expect(source).not.toContain('declare const t:');

    await writeFrameworkTypes(root, 'vanilla', false);
    const vanilla = await fs.readFile(
      path.join(root, 'src/ai-i18n.d.ts'),
      'utf8',
    );
    expect(vanilla).toContain("declare module 'virtual:ai-i18n'");
    expect(vanilla).not.toContain('declare const t:');
    expect(vanilla).not.toContain('useI18n');
  });
});
