import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'plugins/ai-i18n');
const marketplace = path.join(root, 'dist/codex-marketplace');
const plugin = path.join(marketplace, 'plugins/ai-i18n');
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
await fs.rm(marketplace, { recursive: true, force: true });
await fs.cp(path.join(source, 'scripts'), path.join(plugin, 'scripts'), {
  recursive: true,
});
for (const skill of ['integrate-ai-i18n', 'use-ai-i18n-mcp']) {
  await fs.cp(
    path.join(root, '.agents/skills', skill),
    path.join(plugin, 'skills', skill),
    { recursive: true },
  );
}
await fs.copyFile(
  path.join(source, 'README.md'),
  path.join(plugin, 'README.md'),
);
await json(plugin, '.codex-plugin/plugin.json', {
  ...manifest,
  version,
  skills: './skills/',
  mcpServers: './.mcp.json',
});
await json(plugin, '.mcp.json', mcp);
await json(plugin, 'hooks/hooks.json', {
  hooks: {
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command: 'node "${PLUGIN_ROOT}/scripts/stop.mjs"',
            timeout: 120,
          },
        ],
      },
    ],
  },
});
await json(marketplace, '.agents/plugins/marketplace.json', {
  name: 'ai-i18n',
  interface: { displayName: 'ai-i18n' },
  plugins: [
    {
      name: 'ai-i18n',
      source: { source: 'local', path: './plugins/ai-i18n' },
      policy: {
        installation: 'AVAILABLE',
        authentication: 'ON_INSTALL',
      },
      category: 'Productivity',
    },
  ],
});
const sourceSha =
  process.env.GITHUB_SHA == null || process.env.GITHUB_SHA === ''
    ? 'local build'
    : process.env.GITHUB_SHA;
await fs.writeFile(
  path.join(marketplace, 'README.md'),
  [
    '# ai-i18n Codex plugin',
    '',
    'Generated snapshot. Do not edit this branch; rebuild from `main`.',
    '',
    '```sh',
    'codex plugin marketplace add bosens-China/ai-i18n --ref plugin-marketplace',
    'codex plugin add ai-i18n@ai-i18n',
    '```',
    '',
    `Source: ${sourceSha}`,
    `MCP: @ai-i18n/mcp@${version}`,
    '',
  ].join('\n'),
);
console.log(marketplace);
