import { defineConfig } from 'tsdown';

export default defineConfig({
  workspace: { include: 'packages/*' },
  entry: ['src/{index,vite,vue,client,runtime,bin}.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  fixedExtension: false,
  // 当前只发布 package.json 声明的入口，不把内部源码目录变成公共产物。
  unbundle: false,
  dts: true,
  sourcemap: true,
  deps: { neverBundle: true },
  inputOptions: { external: [/^virtual:/] },
  publint: true,
  attw: { profile: 'esm-only', level: 'error' },
});
