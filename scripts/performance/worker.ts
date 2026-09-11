import fs from 'node:fs/promises';
import { diagnosticMessage } from '../../packages/core/src/diagnostics.js';
import path from 'node:path';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import type { BenchmarkMode, BenchmarkSample, ExampleName } from './types.js';

// 仅用于服务端转换基线；不伪造一个可运行的浏览器 i18n 实现。
const baseline: Plugin = {
  name: 'benchmark-virtual-resolution',
  resolveId(id) {
    if (id === 'virtual:ai-i18n') return '\0benchmark-i18n';
  },
  load(id) {
    if (id === '\0benchmark-i18n') return 'export {};';
  },
};

const [example, mode, destination] = process.argv.slice(2) as [
  ExampleName,
  BenchmarkMode,
  string,
];
if (
  !['vue', 'react', 'vanilla'].includes(example) ||
  !['off', 'on', 'profile'].includes(mode) ||
  !destination
) {
  throw new Error(
    diagnosticMessage(
      '内部性能测量参数无效。',
      'Invalid internal benchmark arguments.',
    ),
  );
}
process.env.AI_I18N_BENCHMARK = `benchmark-${mode}`;
const repo = path.resolve(import.meta.dirname, '../..');
const original = path.join(repo, 'examples', example);
const temporary = await fs.mkdtemp(
  path.join(repo, 'examples', '.performance-'),
);
let server: ViteDevServer | undefined;
try {
  await fs.cp(original, temporary, {
    recursive: true,
    filter: (file) =>
      ![
        'node_modules',
        'dist',
        'logs',
        '.turbo',
        'extracted',
        'locales',
      ].includes(path.basename(file)),
  });
  await fs.symlink(
    path.join(original, 'node_modules'),
    path.join(temporary, 'node_modules'),
    'dir',
  );
  const files = (
    await fs.readdir(path.join(temporary, 'src'), { recursive: true })
  )
    .filter(
      (f) => /\.(?:[cm]?[jt]sx?|vue|css)$/.test(f) && !f.endsWith('.d.ts'),
    )
    .map((f) => `/src/${f.split(path.sep).join('/')}`)
    .sort();
  const sourceBytes = (
    await Promise.all(files.map((f) => fs.stat(path.join(temporary, f))))
  ).reduce((n, s) => n + s.size, 0);
  // 进程导入依赖和复制夹具不属于 Vite 启动；配置加载、插件初始化与 listen 在计时内。
  const started = performance.now();
  server = await createServer({
    root: temporary,
    mode: `benchmark-${mode}`,
    logLevel: 'silent',
    cacheDir: path.join(temporary, '.vite-cache'),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      open: false,
      watch: null,
      preTransformRequests: false,
    },
    plugins: mode === 'off' ? [baseline] : [],
  });
  await server.listen();
  const startupMs = performance.now() - started;
  const ai = server.config.plugins.find((p) => p.name === 'ai-i18n');
  if ((mode === 'off') === Boolean(ai))
    throw new Error(
      diagnosticMessage(
        '性能测量的插件模式不正确。',
        'Incorrect benchmark plugin mode.',
      ),
    );
  const api =
    ai &&
    (
      ai as Plugin & {
        [key: symbol]: {
          ready(): Promise<void>;
          flushPersistence(): Promise<void>;
          state(): { modules: Map<string, unknown> };
        };
      }
    )[Symbol.for('ai-i18n.vite.plugin-api')];
  const html = await fs.readFile(path.join(temporary, 'index.html'), 'utf8');
  const transform = async (includeHtml: boolean) => {
    const start = performance.now();
    if (includeHtml) await server!.transformIndexHtml('/', html);
    for (const file of files) {
      const result = await server!.transformRequest(file);
      if (!result?.code)
        throw new Error(
          diagnosticMessage(
            `转换结果为空：${file}`,
            `Empty transform: ${file}`,
          ),
        );
    }
    return performance.now() - start;
  };
  const firstTransformMs = await transform(true);
  const cachedTransformMs = await transform(false);
  server.environments.client!.moduleGraph.invalidateAll();
  const invalidatedTransformMs = await transform(false);
  await api?.ready();
  await api?.flushPersistence();
  if (api && api.state().modules.size === 0)
    throw new Error(
      diagnosticMessage(
        '性能测量未提取到源码。',
        'No source was extracted during the benchmark.',
      ),
    );
  await server.close();
  server = undefined;
  const sample: BenchmarkSample = {
    example,
    mode,
    sourceCount: files.length,
    sourceBytes,
    startupMs,
    firstTransformMs,
    cachedTransformMs,
    invalidatedTransformMs,
  };
  const reports = path.join(temporary, 'logs/performance');
  if (mode === 'profile') {
    const reportFiles = (await fs.readdir(reports)).filter((f) =>
      f.endsWith('.json'),
    );
    if (reportFiles.length !== 1)
      throw new Error(
        diagnosticMessage(
          '性能测量应生成一份报告。',
          'Expected one performance report.',
        ),
      );
    sample.reportFile = path
      .basename(destination)
      .replace('.json', '.profile.json');
    await fs.copyFile(
      path.join(reports, reportFiles[0]!),
      path.join(path.dirname(destination), sample.reportFile),
    );
  } else if (
    await fs.stat(reports).then(
      () => true,
      () => false,
    )
  ) {
    throw new Error(
      diagnosticMessage(
        '关闭的性能诊断意外写入了报告。',
        'Disabled diagnostics unexpectedly wrote a report.',
      ),
    );
  }
  await fs.writeFile(destination, JSON.stringify(sample, null, 2) + '\n');
} finally {
  await server?.close();
  await fs.rm(temporary, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}
