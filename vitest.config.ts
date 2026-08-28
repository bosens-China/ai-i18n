import { configDefaults, defineConfig } from 'vitest/config';

const viteIntegrationTests = [
  'packages/vite/test/build-watch.test.ts',
  'packages/vite/test/html-integration.test.ts',
  'packages/vite/test/integration.test.ts',
  'packages/vite/test/locale-lazy.test.ts',
  'packages/vite/test/provider-build.test.ts',
  'packages/vite/test/react-compiler.test.ts',
  'packages/vite/test/react-integration.test.ts',
  'packages/vite/test/review-server.test.ts',
  'packages/vite/test/vue-integration.test.ts',
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      AI_I18N_DIAGNOSTIC_LOCALE: 'en-US',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'packages/**/test/**/*.test.ts',
            'scripts/test/**/*.test.ts',
          ],
          // 保留 node_modules 等默认排除项，避免 pnpm workspace 软链接重复收集测试。
          exclude: [...configDefaults.exclude, ...viteIntegrationTests],
          maxWorkers: '50%',
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'vite-integration',
          include: viteIntegrationTests,
          pool: 'forks',
          isolate: true,
          // Vite server 集成测试放到后一组并限制 worker，减少文件监听与线程池资源争用。
          maxWorkers: 2,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
