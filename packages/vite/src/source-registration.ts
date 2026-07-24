import MagicString from 'magic-string';
import type { RegistrationInsertion } from './extractor.js';
import { registrationImportOffset } from './plugin-utils.js';
import { AI_I18N_VIRTUAL_MODULE_ID, type Module } from './yuku-analyzer.js';

interface SourceRegistrationOptions {
  code: string;
  id: string;
  moduleId: string;
  registerPrefix: string;
  module: Module;
  registration?: RegistrationInsertion;
  autoImports: readonly string[];
  needsRegistration: boolean;
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
  transformed.appendLeft(offset, injected);
  return {
    code: transformed.toString(),
    map: transformed.generateMap({
      source: options.id,
      includeContent: true,
      hires: true,
    }),
  };
}
