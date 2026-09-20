import { normalizePath, type Environment } from 'vite';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { ProjectState } from './project-state.js';

interface AnalysisPluginContext {
  environment: Environment;
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
  runStateTask: DevStateTaskRunner,
): Promise<boolean> {
  let changed = false;
  const analyzed = await runStateTask(() => project.analyzer.module(moduleId));
  if (!analyzed) return changed;

  // re-export 也需要 Vite 的解析结果，不能依赖 Analyzer 猜测别名路径。
  for (const imported of [...analyzed.imports, ...analyzed.exports]) {
    const specifier = imported.specifier;
    if (specifier === null) continue;
    const resolved = await context.resolve(specifier, importer, {
      skipSelf: true,
    });
    if (!resolved || resolved.external || resolved.id.startsWith('\0')) {
      continue;
    }
    // Vite 的 normalizePath 仅在 win32 会 slash；CI/Linux 上需先替换反斜杠。
    const resolvedId = normalizePath(resolved.id.replaceAll('\\', '/'));
    context.addWatchFile(resolvedId);
    changed =
      (await runStateTask(() => {
        if (project.deferAnalysis) {
          project.setResolution(importer, specifier, resolvedId);
          return false;
        }
        const previousTarget = imported.resolvedModule;
        const resolutionChanged = project.setResolution(
          importer,
          specifier,
          resolvedId,
        );
        const targetId = project.normalizeId(resolvedId);
        // 仅记录未加载的路径不会改变分析图；目标加载后再刷新。
        return (
          resolutionChanged &&
          Boolean(
            previousTarget || (targetId && project.analyzer.module(targetId)),
          )
        );
      })) || changed;
    const targetId = project.normalizeId(resolvedId);
    const shouldLoad = await runStateTask(
      () => pending && Boolean(targetId && !project.analyzer.module(targetId)),
    );
    if (shouldLoad) {
      // Dev 必须走完整环境转换管线，确保依赖在 importer 返回前进入 Analyzer。
      if (context.environment.mode === 'dev') {
        await context.environment.transformRequest(resolvedId);
      } else {
        await context.load({ id: resolvedId });
      }
      changed = true;
    }
  }
  return changed;
}
