import type { ESLint } from 'eslint';
import { tStaticArgs } from './rules/t-static-args.js';

const plugin: ESLint.Plugin = {
  meta: {
    name: '@ai-i18n/eslint-plugin',
    version: '0.0.0',
    namespace: 'ai-i18n',
  },
  rules: {
    't-static-args': tStaticArgs,
  },
  configs: {},
};

// 规则集必须由使用者显式引入，不会修改宿主项目的 ESLint 配置。
plugin.configs!.recommended = [
  {
    plugins: { 'ai-i18n': plugin },
    rules: { 'ai-i18n/t-static-args': 'error' },
  },
];

export { tStaticArgs };
export default plugin;
