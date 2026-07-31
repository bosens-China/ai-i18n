import path from 'node:path';
import type { ExtractResult } from './yuku-analyzer.js';
import type { Analyzer } from './yuku-analyzer.js';

export function registrationWatchFiles(
  analyzer: Analyzer,
  root: string,
  moduleId: string,
): string[] {
  analyzer.link();
  const queue = [moduleId];
  const watched = new Set<string>();
  while (queue.length) {
    const currentId = queue.shift()!;
    if (watched.has(currentId)) continue;
    watched.add(currentId);
    const current = analyzer.module(currentId);
    if (current) {
      queue.push(...current.dependencies.map((dependency) => dependency.path));
    }
  }
  return [...watched].map((source) => path.resolve(root, source));
}

export function registrationLoadFiles(
  modules: ReadonlyMap<string, ExtractResult>,
  root: string,
  moduleId: string,
): string[] {
  return (modules.get(moduleId)?.dependencies ?? []).map((source) =>
    path.resolve(root, source),
  );
}
