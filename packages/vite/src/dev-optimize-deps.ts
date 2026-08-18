import type { ConfigEnv, UserConfig } from 'vite';

export function optimizeDevRuntimeDependencies(
  environment: ConfigEnv,
): UserConfig | undefined {
  if (environment.command !== 'serve') return undefined;
  // 这些入口都是插件注入的纯 ESM；直接交给 Vite 转换可避免首次发现后整页 reload。
  return {
    optimizeDeps: {
      exclude: [
        '@ai-i18n/vite/runtime',
        '@ai-i18n/vite/vue',
        '@ai-i18n/vite/react',
      ],
    },
  };
}
