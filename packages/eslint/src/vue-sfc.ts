import { createRequire } from 'node:module';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import {
  analyzeVueSource,
  type VueAnalysisSource,
  type VueCompiler,
} from '@ai-i18n/analyzer/vue';

interface VueParserServices {
  getDocumentFragment?: () => unknown;
}

type Require = ReturnType<typeof createRequire>;
type NodeVueCompiler = VueCompiler & {
  registerTS?: (loadTypeScript: () => unknown) => void;
};

const packageRequire = createRequire(import.meta.url);

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
    // Vue preset 真正处理 SFC 时才加载编译器，不影响 React/Vanilla 项目。
    const compiler = loadVueCompiler(filename);
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

function loadVueCompiler(filename: string): VueCompiler {
  const hostRequire = createRequire(path.resolve(filename));
  // 优先复用宿主 Vue 的 Node wrapper，它会为 imported types 注册 TypeScript。
  const compiler = (tryRequire(hostRequire, 'vue/compiler-sfc') ??
    tryRequire(packageRequire, 'vue/compiler-sfc') ??
    tryRequire(hostRequire, '@vue/compiler-sfc') ??
    packageRequire('@vue/compiler-sfc')) as NodeVueCompiler;
  compiler.registerTS?.(() => {
    const typescript =
      tryResolve(hostRequire, 'typescript') ??
      tryResolve(packageRequire, 'typescript');
    return packageRequire(typescript ?? 'typescript');
  });
  return compiler;
}

function tryRequire(require: Require, id: string): unknown {
  const resolved = tryResolve(require, id);
  return resolved ? require(resolved) : null;
}

function tryResolve(require: Require, id: string): string | null {
  try {
    return require.resolve(id);
  } catch (error) {
    if (isMissingVueCompiler(error)) return null;
    throw error;
  }
}

function isMissingVueCompiler(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'MODULE_NOT_FOUND' ||
      error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
  );
}
