import { createRequire } from 'node:module';
import {
  analyzeVueSource,
  type VueAnalysisSource,
  type VueCompiler,
} from '@ai-i18n/analyzer/vue';

interface VueParserServices {
  getDocumentFragment?: () => unknown;
}

const require = createRequire(import.meta.url);

export function createVueAnalysisSource(
  source: string,
  filename: string,
  parserServices: VueParserServices,
): VueAnalysisSource {
  if (!parserServices.getDocumentFragment?.()) {
    throw new Error('检查 .vue 文件需要使用 vue-eslint-parser');
  }

  try {
    // Vue 编译器仅在 configs.vue 真正处理 SFC 时加载，不影响 React/Vanilla 项目。
    const compiler = require('@vue/compiler-sfc') as VueCompiler;
    return analyzeVueSource(source, filename, compiler);
  } catch (error) {
    if (isMissingVueCompiler(error)) {
      throw new Error('检查 .vue 文件需要安装 @vue/compiler-sfc');
    }
    throw error;
  }
}

function isMissingVueCompiler(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'MODULE_NOT_FOUND'
  );
}
