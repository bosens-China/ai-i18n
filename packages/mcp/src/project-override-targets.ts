import { fail } from './errors.js';
import { findExtracted, type LoadedProject } from './project-files.js';
import {
  resolveTargets,
  targetDetails,
  type ResolvedTarget,
} from './project-targets.js';
import type { OverrideUpdate } from './project.js';

type LocalizedOverrideUpdate = OverrideUpdate & { locale: string };

export function resolveOverrideTargets(
  project: LoadedProject,
  updates: readonly LocalizedOverrideUpdate[],
): Array<ResolvedTarget<LocalizedOverrideUpdate>> {
  return resolveTargets(project, updates).flatMap((target) => {
    if (target.input.files && target.input.occurrences) {
      fail('INVALID_OVERRIDE_SCOPE', targetDetails(target.input));
    }
    if (target.input.occurrences) {
      const occurrences = deduplicateOccurrences(target.input.occurrences);
      for (const occurrence of occurrences) {
        const file = findExtracted(project, occurrence.source_file);
        const extracted = file.messages.find(
          (message) => message.id === target.message.id,
        );
        if (
          !extracted?.locations.some(
            (location) =>
              location.line === occurrence.line &&
              location.column === occurrence.column,
          )
        ) {
          fail('MESSAGE_NOT_FOUND_AT_SOURCE_LOCATION', {
            ...targetDetails(target.input),
            occurrence,
          });
        }
      }
      return occurrences.map((occurrence) => ({
        ...target,
        input: { ...target.input, occurrences: [occurrence] },
        sourceFiles: [occurrence.source_file],
      }));
    }
    if (!target.input.files) return [target];
    const files = [...new Set(target.input.files)].sort();
    for (const sourceFile of files) {
      const file = findExtracted(project, sourceFile);
      if (!file.messages.some((message) => message.id === target.message.id)) {
        fail('MESSAGE_NOT_FOUND_IN_SOURCE_FILE', {
          ...targetDetails(target.input),
          source_file: sourceFile,
        });
      }
    }
    return files.map((file) => ({
      ...target,
      input: { ...target.input, files: [file] },
      sourceFiles: [file],
    }));
  });
}

function deduplicateOccurrences(
  occurrences: NonNullable<OverrideUpdate['occurrences']>,
): NonNullable<OverrideUpdate['occurrences']> {
  const unique = new Map(
    occurrences.map((occurrence) => [
      JSON.stringify([
        occurrence.source_file,
        occurrence.line,
        occurrence.column,
      ]),
      occurrence,
    ]),
  );
  return [...unique.values()].sort((left, right) => {
    const leftKey = JSON.stringify([left.source_file, left.line, left.column]);
    const rightKey = JSON.stringify([
      right.source_file,
      right.line,
      right.column,
    ]);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}
