import type { SFCDescriptor } from '@vue/compiler-sfc';
import {
  analyzeModule,
  findRuntimeImportDeclarations,
  type AnalysisLanguage,
  type RuntimeImportDeclaration,
} from './index.js';

export function findVueRuntimeImports(
  descriptor: SFCDescriptor,
  id: string,
): RuntimeImportDeclaration[] {
  return [descriptor.script, descriptor.scriptSetup].flatMap((block, index) => {
    if (!block || block.src) return [];
    const module = analyzeModule(
      block.content,
      `${id}?runtime-import=${index}`,
      undefined,
      scriptLanguage(block.lang),
    );
    return findRuntimeImportDeclarations(module).map((declaration) => ({
      ...declaration,
      start: declaration.start + block.loc.start.offset,
      end: declaration.end + block.loc.start.offset,
      placement: block === descriptor.scriptSetup ? 'setup' : 'module',
    }));
  });
}

function scriptLanguage(lang: string | undefined): AnalysisLanguage {
  return lang === 'ts' || lang === 'tsx' || lang === 'jsx' ? lang : 'js';
}
