import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
it('packages the same Skills and bounds each platform continuation', async () => {
  await exec(process.execPath, ['scripts/build-agent-plugins.mjs']);
  const script = path.resolve('plugins/ai-i18n/scripts/stop.mjs');
  const { shouldCheck, feedback, check } = await import(script);
  expect(shouldCheck('codex', { stop_hook_active: false })).toBe(true);
  expect(shouldCheck('codex', { stop_hook_active: true })).toBe(false);
  expect(shouldCheck('cursor', { status: 'completed', loop_count: 0 })).toBe(
    true,
  );
  expect(shouldCheck('cursor', { status: 'aborted', loop_count: 0 })).toBe(
    false,
  );
  expect(shouldCheck('cursor', { status: 'completed', loop_count: 1 })).toBe(
    false,
  );
  expect(
    shouldCheck('antigravity', {
      executionNum: 1,
      terminationReason: 'model_stop',
      fullyIdle: true,
    }),
  ).toBe(true);
  expect(
    shouldCheck('antigravity', {
      executionNum: 2,
      terminationReason: 'model_stop',
      fullyIdle: true,
    }),
  ).toBe(false);
  expect(feedback('codex', 'missing')).toEqual({
    decision: 'block',
    reason: 'missing',
  });
  expect(feedback('cursor', 'missing')).toEqual({
    followup_message: 'missing',
  });
  expect(feedback('antigravity', 'missing')).toEqual({
    decision: 'continue',
    reason: 'missing',
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-hook-'));
  try {
    expect(
      await check('codex', { cwd: root, stop_hook_active: false }),
    ).toEqual({});
    for (const host of ['codex', 'cursor', 'antigravity']) {
      const plugin = path.resolve('dist/agent-plugins', host, 'ai-i18n');
      expect(
        await fs.readFile(
          path.join(plugin, 'skills/use-ai-i18n-mcp/SKILL.md'),
          'utf8',
        ),
      ).toBe(
        await fs.readFile('.agents/skills/use-ai-i18n-mcp/SKILL.md', 'utf8'),
      );
    }
    const installed = path.join(root, "plugin with 'quotes'");
    await fs.cp('dist/agent-plugins/antigravity/ai-i18n', installed, {
      recursive: true,
    });
    await exec(process.execPath, [
      path.join(installed, 'scripts/configure-antigravity.mjs'),
    ]);
    const hooks = JSON.parse(
      await fs.readFile(path.join(installed, 'hooks.json'), 'utf8'),
    );
    expect(hooks['ai-i18n'].Stop[0].command).toContain('scripts/stop.mjs');
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ devDependencies: { '@ai-i18n/vite': '1.0.0' } }),
    );
    const pkg = path.join(root, 'node_modules/@ai-i18n/vite');
    await fs.mkdir(pkg, { recursive: true });
    await fs.writeFile(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        type: 'module',
        exports: { './internal/scan': './scan.mjs' },
      }),
    );
    await fs.writeFile(
      path.join(pkg, 'scan.mjs'),
      `export async function scanProject() { console.log('config diagnostic'); return { i18n_directory: '/app/i18n', locales: [{locale:'en-US', missing:1}] }; }`,
    );
    const bundledScript = path.resolve(
      'dist/agent-plugins/codex/ai-i18n/scripts/stop.mjs',
    );
    const bundled = await import(bundledScript);
    expect(
      await bundled.check('codex', { cwd: root, stop_hook_active: false }),
    ).toMatchObject({
      decision: 'block',
      reason: expect.stringContaining('en-US=1'),
    });
    await fs.writeFile(
      path.join(pkg, 'scan.mjs'),
      `export async function scanProject() { return { locales: [{locale:'en-US', missing:0}] }; }`,
    );
    expect(
      await bundled.check('codex', { cwd: root, stop_hook_active: false }),
    ).toEqual({});
    await fs.writeFile(
      path.join(pkg, 'scan.mjs'),
      `export async function scanProject() { throw new Error('broken config'); }`,
    );
    expect(
      await bundled.check('codex', { cwd: root, stop_hook_active: false }),
    ).toMatchObject({
      decision: 'block',
      reason: expect.stringContaining('could not verify'),
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
