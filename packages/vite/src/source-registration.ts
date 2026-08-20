import MagicString from 'magic-string';
import type { ModuleMessages } from '@ai-i18n/core';
import {
  diagnosticMessage,
  findInvalidDefineI18nMessagesReferences,
  type DefineI18nMessagesCall,
  type Module,
  type RuntimeImportDeclaration,
} from '@ai-i18n/analyzer';
import type { RegistrationInsertion } from './extractor.js';
import type { SourceLocation } from './extractor.js';
import { instrumentTranslationOccurrences } from './occurrence-instrumentation.js';
import { registrationImportOffset } from './plugin-utils.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

interface SourceRegistrationOptions {
  code: string;
  id: string;
  moduleId: string;
  registerPrefix: string;
  module: Module;
  registration?: RegistrationInsertion;
  templateRegistration?: RegistrationInsertion;
  autoImports: readonly string[];
  runtimeImports?: readonly RuntimeImportDeclaration[];
  templateImports: readonly string[];
  needsRegistration: boolean;
  dev: boolean;
  registrationMessages?: ModuleMessages;
  preserveAutoImportBindings?: boolean;
  macroCalls: readonly DefineI18nMessagesCall[];
  occurrenceLocations?: readonly SourceLocation[];
}

const SCOPED_RUNTIME_EXPORTS = new Set([
  't',
  'useI18n',
  'tRef',
  'i18nComputed',
  'tComputed',
]);

export function assertDirectDefineI18nMessagesCalls(module: Module): void {
  if (findInvalidDefineI18nMessagesReferences(module).length) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] defineI18nMessages() 只能直接调用，不能作为运行时值使用。',
        '[ai-i18n] defineI18nMessages() must be called directly and cannot be used as a runtime value.',
      ),
    );
  }
}

export function sourceRegistration(options: SourceRegistrationOptions) {
  const runtimeImports = options.runtimeImports ?? [];
  const fallbackOffset = registrationImportOffset(
    options.code,
    options.module.ast.body,
  );
  const registration = options.registration ?? { offset: fallbackOffset };
  const templateRegistration = options.templateRegistration ?? registration;
  const sharesTarget = sameInsertion(registration, templateRegistration);
  const primaryRuntimeImports = runtimeImports.filter(
    ({ placement }) => placement !== 'setup' || sharesTarget,
  );
  const setupRuntimeImports = sharesTarget
    ? []
    : runtimeImports.filter(({ placement }) => placement === 'setup');
  const templateBindings = createTemplateBindings(
    options.templateImports.filter(
      (name) =>
        !setupRuntimeImports.some(({ specifiers }) =>
          specifiers.some(({ local }) => local === name),
        ),
    ),
    options.code,
  );
  const templateNames = new Set(templateBindings.map(({ name }) => name));
  const primarySpecifiers = [
    ...new Set(
      options.autoImports.filter(
        (name) => !sharesTarget || !templateNames.has(name),
      ),
    ),
    ...(sharesTarget
      ? templateBindings.map(({ alias, name }) => `${name} as ${alias}`)
      : []),
    ...runtimeImportSpecifiers(primaryRuntimeImports),
  ];
  // Vue 编译器允许宏默认值引用 import，但会拒绝引用 setup 局部 const。
  // 脚本自动导入继续保留为 import，模板专用绑定仍可复用共享运行时。
  const preservePrimaryImports =
    options.dev && options.preserveAutoImportBindings === true;
  const primaryLines = [
    ...(options.dev
      ? [
          ...(preservePrimaryImports
            ? runtimeImportLines(primarySpecifiers)
            : []),
          ...sharedRuntimeLines(
            preservePrimaryImports ? [] : primarySpecifiers,
            options.moduleId,
            options.registrationMessages,
            options.code,
            'Primary',
          ),
        ]
      : [
          ...runtimeImportLines(primarySpecifiers),
          ...(options.needsRegistration
            ? [
                `import ${JSON.stringify(`${options.registerPrefix}${encodeURIComponent(options.moduleId)}`)};`,
              ]
            : []),
        ]),
    ...(sharesTarget
      ? templateBindings.map(({ alias, name }) => `const ${name} = ${alias};`)
      : []),
  ];
  const templateLines = sharesTarget
    ? []
    : [
        ...(options.dev
          ? sharedRuntimeLines(
              [
                ...templateBindings.map(
                  ({ alias, name }) => `${name} as ${alias}`,
                ),
                ...runtimeImportSpecifiers(setupRuntimeImports),
              ],
              options.moduleId,
              undefined,
              options.code,
              'Template',
            )
          : runtimeImportLines(
              templateBindings.map(({ alias, name }) => `${name} as ${alias}`),
            )),
        ...templateBindings.map(
          ({ alias, name }) => `const ${name} = ${alias};`,
        ),
      ];
  const transformed = new MagicString(options.code, { filename: options.id });
  for (const declaration of runtimeImports) {
    const end =
      options.code[declaration.end] === ';'
        ? declaration.end + 1
        : declaration.end;
    transformed.remove(declaration.start, end);
  }
  insertLines(
    transformed,
    registration,
    primaryLines,
    !options.registration && fallbackOffset > 0,
  );
  insertLines(transformed, templateRegistration, templateLines, false);
  eraseDefineI18nMessages(transformed, options.code, options.macroCalls);
  instrumentTranslationOccurrences(
    transformed,
    options.code,
    options.occurrenceLocations ?? [],
  );
  return transformedResult(transformed, options.id);
}

function createTemplateBindings(names: readonly string[], code: string) {
  const used = new Set<string>();
  return [...new Set(names)].map((name) => {
    const base = `__aiI18nTemplate${name[0]!.toUpperCase()}${name.slice(1)}`;
    let alias = base;
    let index = 0;
    while (code.includes(alias) || used.has(alias)) {
      alias = `${base}${++index}`;
    }
    used.add(alias);
    return { alias, name };
  });
}

function runtimeImportLines(specifiers: readonly string[]): string[] {
  return specifiers.length
    ? [
        `import { ${specifiers.join(', ')} } from ${JSON.stringify(AI_I18N_VIRTUAL_MODULE_ID)};`,
      ]
    : [];
}

function sharedRuntimeLines(
  specifiers: readonly string[],
  moduleId: string,
  messages: ModuleMessages | undefined,
  code: string,
  label: string,
): string[] {
  if (!specifiers.length && !messages) return [];
  const runtimeName = uniqueName(code, `__aiI18n${label}Runtime`);
  const moduleName = uniqueName(code, `__aiI18n${label}ModuleId`);
  const bindings = specifiers.map(runtimeBinding);
  const hasScopedBinding = bindings.some(({ imported }) =>
    SCOPED_RUNTIME_EXPORTS.has(imported),
  );
  const scopeName = uniqueName(code, `__aiI18n${label}Scope`);
  const lines = [
    `import * as ${runtimeName} from ${JSON.stringify(`${AI_I18N_VIRTUAL_MODULE_ID}/internal`)};`,
    `const ${moduleName} = ${JSON.stringify(moduleId)};`,
  ];
  if (messages) {
    lines.push(
      `${runtimeName}.__registerModule(${moduleName}, ${JSON.stringify(messages)});`,
      `if (import.meta.hot) import.meta.hot.dispose(() => ${runtimeName}.__unregisterModule(${moduleName}));`,
    );
  }
  if (hasScopedBinding) {
    lines.push(`const ${scopeName} = ${runtimeName}.__scope(${moduleName});`);
  }
  for (const { imported, local } of bindings) {
    const owner = SCOPED_RUNTIME_EXPORTS.has(imported)
      ? scopeName
      : runtimeName;
    lines.push(`const ${local} = ${owner}.${imported};`);
  }
  return lines;
}

function runtimeBinding(specifier: string): {
  imported: string;
  local: string;
} {
  const [imported, local] = specifier.split(' as ');
  return { imported: imported!, local: local ?? imported! };
}

function runtimeImportSpecifiers(
  declarations: readonly RuntimeImportDeclaration[],
): string[] {
  return declarations.flatMap(({ specifiers }) =>
    specifiers.map(({ imported, local }) =>
      imported === local ? imported : `${imported} as ${local}`,
    ),
  );
}

function uniqueName(code: string, base: string): string {
  let name = base;
  let index = 0;
  while (code.includes(name)) name = `${base}${++index}`;
  return name;
}

function sameInsertion(
  left: RegistrationInsertion,
  right: RegistrationInsertion,
): boolean {
  return (
    left.offset === right.offset &&
    left.prefix === right.prefix &&
    left.suffix === right.suffix
  );
}

function insertLines(
  transformed: MagicString,
  insertion: RegistrationInsertion,
  lines: readonly string[],
  leadingNewline: boolean,
): void {
  if (!lines.length) return;
  transformed.appendLeft(
    insertion.offset,
    `${insertion.prefix ?? (leadingNewline ? '\n' : '')}${lines.join('\n')}\n${insertion.suffix ?? ''}`,
  );
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
        diagnosticMessage(
          '[ai-i18n] defineI18nMessages() 只能接收一个参数。',
          '[ai-i18n] defineI18nMessages() requires exactly one argument.',
        ),
      );
    }
    if (call.start < previousEnd) {
      throw new Error(
        diagnosticMessage(
          '[ai-i18n] 不支持嵌套调用 defineI18nMessages()。',
          '[ai-i18n] Nested defineI18nMessages() calls are not supported.',
        ),
      );
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
