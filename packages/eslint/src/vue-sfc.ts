import { createRequire } from 'node:module';
import { diagnosticMessage } from '@ai-i18n/analyzer';
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
    throw new Error(
      diagnosticMessage(
        '检查 .vue 文件需要配置 vue-eslint-parser。',
        'Configure vue-eslint-parser to lint .vue files.',
      ),
    );
  }

  try {
    // Vue 编译器仅在 configs.vue 真正处理 SFC 时加载，不影响 React/Vanilla 项目。
    const compiler = require('@vue/compiler-sfc') as VueCompiler;
    return analyzeVueSource(source, filename, compiler);
  } catch (error) {
    if (isMissingVueCompiler(error)) {
      throw new Error(
        diagnosticMessage(
          '检查 .vue 文件需要安装 @vue/compiler-sfc。',
          'Install @vue/compiler-sfc to lint .vue files.',
        ),
      );
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
