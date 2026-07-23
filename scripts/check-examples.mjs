import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const configuredExamples = [
  { root: 'examples/vanilla', modules: ['/src/main.ts'] },
  {
    root: 'examples/vue',
    modules: ['/src/main.ts', '/src/App.vue'],
  },
  {
    root: 'examples/react',
    modules: ['/src/main.tsx', '/src/App.tsx'],
  },
  {
    root: 'examples/mixed',
    modules: [
      '/src/main.tsx',
      '/src/VuePanel.vue',
      '/src/vue/VueJsxPanel.tsx',
      '/src/ReactPanel.tsx',
    ],
  },
];
const selected = new Set(process.argv.slice(2));
const examples = selected.size
  ? configuredExamples.filter(({ root }) => selected.has(path.basename(root)))
  : configuredExamples;

for (const example of examples) {
  process.stdout.write(`checking ${example.root}... `);
  const root = path.resolve(example.root);
  const server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
    await server.transformIndexHtml('/index.html', html);
    for (const module of example.modules) {
      process.stdout.write(`${module} `);
      await server.transformRequest(module);
      process.stdout.write('✓ ');
    }
  } finally {
    await server.close();
  }
  process.stdout.write('ok\n');
}

// Vite middleware 模式在部分框架插件下会保留后台句柄；全部关闭成功后确定退出。
process.exit(0);
