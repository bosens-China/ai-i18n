import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'plugins/ai-i18n');
const output = path.join(root, 'dist/agent-plugins');
const manifest = JSON.parse(
  await fs.readFile(path.join(source, '.codex-plugin/plugin.json'), 'utf8'),
);
const { version } = JSON.parse(
  await fs.readFile(path.join(root, 'packages/mcp/package.json'), 'utf8'),
);
const mcp = {
  mcpServers: {
    'ai-i18n': { command: 'npx', args: ['-y', `@ai-i18n/mcp@${version}`] },
  },
};
const json = async (directory, filename, value) => {
  const target = path.join(directory, filename);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value, null, 2) + '\n');
};
for (const host of ['codex', 'cursor', 'antigravity']) {
  const directory = path.join(output, host, 'ai-i18n');
  await fs.rm(directory, { recursive: true, force: true });
  await fs.cp(path.join(source, 'scripts'), path.join(directory, 'scripts'), {
    recursive: true,
  });
  for (const skill of ['integrate-ai-i18n', 'use-ai-i18n-mcp']) {
    await fs.cp(
      path.join(root, '.agents/skills', skill),
      path.join(directory, 'skills', skill),
      { recursive: true },
    );
  }
  await fs.copyFile(
    path.join(source, 'README.md'),
    path.join(directory, 'README.md'),
  );
  if (host === 'codex') {
    await json(directory, '.codex-plugin/plugin.json', {
      ...manifest,
      version,
      skills: './skills/',
      mcpServers: './.mcp.json',
    });
    await json(directory, '.mcp.json', mcp);
    await json(directory, 'hooks/hooks.json', {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "${PLUGIN_ROOT}/scripts/stop.mjs" codex',
                timeout: 120,
              },
            ],
          },
        ],
      },
    });
  } else if (host === 'cursor') {
    await json(directory, '.cursor-plugin/plugin.json', {
      name: 'ai-i18n',
      version,
      description: manifest.description,
    });
    await json(directory, '.mcp.json', mcp);
    await json(directory, 'hooks/hooks.json', {
      version: 1,
      hooks: {
        stop: [
          {
            command: 'node "${CURSOR_PLUGIN_ROOT}/scripts/stop.mjs" cursor',
            loop_limit: 1,
          },
        ],
      },
    });
  } else {
    await json(directory, 'plugin.json', { name: 'ai-i18n' });
    await json(directory, 'mcp_config.json', mcp);
  }
}
console.log(output);
