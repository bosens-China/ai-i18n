import { createMessageId } from '@ai-i18n/core';
import type { ProjectState } from './project-state.js';
import type { RemoteContext, RemoteMessage } from './remote.js';

export function remoteCatalog(project: ProjectState) {
  const messages = new Map<string, RemoteMessage>();
  for (const [file, result] of project.modules) {
    for (const message of result.messages) {
      const id = createMessageId(message.source, message);
      const current = messages.get(id);
      messages.set(id, {
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        occurrences: [
          ...(current?.occurrences ?? []),
          ...message.locations.map(({ line, column }) => ({
            file,
            line,
            column,
          })),
        ],
      });
    }
  }
  const catalog = [...messages]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, message]) => {
      for (const occurrence of message.occurrences) Object.freeze(occurrence);
      Object.freeze(message.occurrences);
      return Object.freeze(message);
    });
  return Object.freeze(catalog);
}

export function remoteContext(
  project: ProjectState,
  command: RemoteContext['command'],
  messages: RemoteContext['messages'],
  signal: AbortSignal,
): RemoteContext {
  return Object.freeze({
    command,
    sourceLang: project.options.sourceLang,
    locales: Object.freeze(
      project.options.locales
        .map(({ value }) => value)
        .filter((value) => value !== project.options.sourceLang),
    ),
    messages,
    signal,
  });
}
