import { normalizePath } from 'vite';
import type { ProjectState } from './project-state.js';

interface AnalysisPluginContext {
  resolve(
    source: string,
    importer: string,
    options: { skipSelf: true },
  ): Promise<{ id: string; external?: boolean | string } | null>;
  addWatchFile(id: string): void;
  load(options: { id: string }): Promise<unknown>;
}

export async function resolveAnalysisDependencies(
  context: AnalysisPluginContext,
  project: ProjectState,
  importer: string,
  moduleId: string,
  pending: boolean,
): Promise<boolean> {
  let changed = false;
  const analyzed = project.analyzer.module(moduleId);
  if (!analyzed) return changed;

  for (const imported of analyzed.imports) {
    const resolved = await context.resolve(imported.specifier, importer, {
      skipSelf: true,
    });
    if (!resolved || resolved.external || resolved.id.startsWith('\0')) {
      continue;
    }
    // Vite 的 normalizePath 仅在 win32 会 slash；CI/Linux 上需先替换反斜杠。
    const resolvedId = normalizePath(resolved.id.replaceAll('\\', '/'));
    context.addWatchFile(resolvedId);
    changed =
      project.setResolution(importer, imported.specifier, resolvedId) ||
      changed;
    const targetId = project.normalizeId(resolvedId);
    if (pending && targetId && !project.analyzer.module(targetId)) {
      await context.load({ id: resolvedId });
      changed = true;
    }
  }
  return changed;
}
