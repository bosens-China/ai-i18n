import { defineConfig, presetWind3 } from 'unocss';
import { demoTheme } from '../shared/uno-theme';

export default defineConfig({
  ...demoTheme,
  presets: [presetWind3()],
  // Vanilla 与远程示例在 TypeScript 字符串中书写模板，也需要扫描。
  content: { pipeline: { include: [/\.(vue|[jt]sx?|html)($|\?)/] } },
});
