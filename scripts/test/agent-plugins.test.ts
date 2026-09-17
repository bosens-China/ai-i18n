import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
it('packages the Codex marketplace and permits only one continuation', async () => {
  await exec(process.execPath, ['scripts/build-agent-plugins.mjs']);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-hook-'));
  try {
    const plugin = path.resolve('dist/codex-marketplace/plugins/ai-i18n');
    const installed = path.join(root, "plugin with 'quotes'");
    await fs.cp(plugin, installed, { recursive: true });
    const bundled = await import(path.join(installed, 'scripts/stop.mjs'));
    expect(await bundled.check({ cwd: root, stop_hook_active: false })).toEqual(
      {},
    );
    for (const skill of ['integrate-ai-i18n', 'use-ai-i18n-mcp']) {
      expect(
        await fs.readFile(
          path.join(plugin, 'skills', skill, 'SKILL.md'),
          'utf8',
        ),
      ).toBe(
        await fs.readFile(
          path.join('.agents/skills', skill, 'SKILL.md'),
          'utf8',
        ),
      );
    }
    const { version } = JSON.parse(
      await fs.readFile('packages/mcp/package.json', 'utf8'),
    );
    const manifest = JSON.parse(
      await fs.readFile(path.join(plugin, '.codex-plugin/plugin.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      name: 'ai-i18n',
      version,
      skills: './skills/',
      mcpServers: './.mcp.json',
    });
    expect(
      JSON.parse(
        await fs.readFile(path.join(plugin, manifest.mcpServers), 'utf8'),
      ),
    ).toEqual({
      mcpServers: {
        'ai-i18n': { command: 'npx', args: ['-y', `@ai-i18n/mcp@${version}`] },
      },
    });
    const hooks = JSON.parse(
      await fs.readFile(path.join(plugin, 'hooks/hooks.json'), 'utf8'),
    );
    expect(hooks.hooks.Stop[0].hooks[0]).toEqual({
      type: 'command',
      command: 'node "${PLUGIN_ROOT}/scripts/stop.mjs"',
      timeout: 120,
    });
    expect(await fs.readdir(path.join(plugin, 'scripts'))).toEqual([
      'stop.mjs',
    ]);
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
    expect(
      await bundled.check({ cwd: root, stop_hook_active: false }),
    ).toMatchObject({
      decision: 'block',
      reason: expect.stringContaining('en-US=1'),
    });
    expect(await bundled.check({ cwd: root, stop_hook_active: true })).toEqual(
      {},
    );
    expect(await bundled.check({ cwd: root })).toEqual({});
    const marketplace = JSON.parse(
      await fs.readFile(
        'dist/codex-marketplace/.agents/plugins/marketplace.json',
        'utf8',
      ),
    );
    expect(marketplace).toMatchObject({
      name: 'ai-i18n',
      plugins: [
        {
          name: 'ai-i18n',
          source: { source: 'local', path: './plugins/ai-i18n' },
        },
      ],
    });
    expect(
      await fs.readFile(
        'dist/codex-marketplace/plugins/ai-i18n/skills/use-ai-i18n-mcp/SKILL.md',
        'utf8',
      ),
    ).toBe(
      await fs.readFile('.agents/skills/use-ai-i18n-mcp/SKILL.md', 'utf8'),
    );
    await fs.writeFile(
      path.join(pkg, 'scan.mjs'),
      `export async function scanProject() { return { locales: [{locale:'en-US', missing:0}] }; }`,
    );
    expect(await bundled.check({ cwd: root, stop_hook_active: false })).toEqual(
      {},
    );
    await fs.writeFile(
      path.join(pkg, 'scan.mjs'),
      `export async function scanProject() { throw new Error('broken config'); }`,
    );
    expect(
      await bundled.check({ cwd: root, stop_hook_active: false }),
    ).toMatchObject({
      decision: 'block',
      reason: expect.stringContaining('could not verify'),
    });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
