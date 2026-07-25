import MagicString from 'magic-string';
import {
  findInvalidDefineI18nMessagesReferences,
  type DefineI18nMessagesCall,
  type Module,
} from '@ai-i18n/analyzer';
import type { RegistrationInsertion } from './extractor.js';
import { registrationImportOffset } from './plugin-utils.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

interface SourceRegistrationOptions {
  code: string;
  id: string;
  moduleId: string;
  registerPrefix: string;
  module: Module;
  registration?: RegistrationInsertion;
  autoImports: readonly string[];
  needsRegistration: boolean;
  macroCalls: readonly DefineI18nMessagesCall[];
}

export function assertDirectDefineI18nMessagesCalls(module: Module): void {
  if (findInvalidDefineI18nMessagesReferences(module).length) {
    throw new Error(
      '[ai-i18n] defineI18nMessages must be called directly and cannot be used as a runtime value',
    );
  }
}

export function sourceRegistration(options: SourceRegistrationOptions) {
  const imports = [
    ...(options.autoImports.length
      ? [
          `import { ${options.autoImports.join(', ')} } from ${JSON.stringify(AI_I18N_VIRTUAL_MODULE_ID)};`,
        ]
      : []),
    ...(options.needsRegistration
      ? [
          `import ${JSON.stringify(`${options.registerPrefix}${encodeURIComponent(options.moduleId)}`)};`,
        ]
      : []),
  ];
  const offset =
    options.registration?.offset ??
    registrationImportOffset(options.code, options.module.ast.body);
  const injected = options.registration
    ? `${options.registration.prefix ?? ''}${imports.join('\n')}\n${options.registration.suffix ?? ''}`
    : `${offset ? '\n' : ''}${imports.join('\n')}\n`;
  const transformed = new MagicString(options.code, { filename: options.id });
  if (imports.length) transformed.appendLeft(offset, injected);
  eraseDefineI18nMessages(transformed, options.code, options.macroCalls);
  return transformedResult(transformed, options.id);
}

export function transformDefineI18nMessages(
  code: string,
  id: string,
  calls: readonly DefineI18nMessagesCall[],
) {
  if (!calls.length) return null;
  const transformed = new MagicString(code, { filename: id });
  eraseDefineI18nMessages(transformed, code, calls);
  return transformedResult(transformed, id);
}

function eraseDefineI18nMessages(
  transformed: MagicString,
  code: string,
  calls: readonly DefineI18nMessagesCall[],
): void {
  let previousEnd = -1;
  for (const call of [...calls].sort((a, b) => a.start - b.start)) {
    if (!call.argument) {
      throw new Error(
        '[ai-i18n] defineI18nMessages() requires exactly one argument',
      );
    }
    if (call.start < previousEnd) {
      throw new Error('[ai-i18n] nested defineI18nMessages() is not supported');
    }
    previousEnd = call.end;
    transformed.overwrite(
      call.start,
      call.end,
      `(${code.slice(call.argument.start, call.argument.end)})`,
    );
  }
}

function transformedResult(transformed: MagicString, id: string) {
  return {
    code: transformed.toString(),
    map: transformed.generateMap({
      source: id,
      includeContent: true,
      hires: true,
    }),
  };
}
