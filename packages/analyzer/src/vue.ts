import type {
  compileScript as compileVueScript,
  parse as parseVue,
  SFCBlock,
  SFCDescriptor,
} from '@vue/compiler-sfc';
import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';
import {
  analyzeModule,
  findDefineI18nMessagesCalls,
  type AnalysisLanguage,
  type DefineI18nMessagesCall,
  type SourceLocation,
} from './index.js';

export interface VueCompiler {
  parse: typeof parseVue;
  compileScript: typeof compileVueScript;
}

export interface VueRegistrationInsertion {
  offset: number;
  prefix?: string;
  suffix?: string;
}

export interface VueAnalysisSource {
  code: string;
  lang: AnalysisLanguage;
  mapLocation(location: SourceLocation): SourceLocation;
  registration: VueRegistrationInsertion;
  macroCalls: DefineI18nMessagesCall[];
}

export function analyzeVueSource(
  source: string,
  id: string,
  compiler: VueCompiler,
): VueAnalysisSource {
  const { descriptor, errors } = compiler.parse(source, {
    filename: id,
    sourceMap: true,
  });
  if (errors.length) {
    throw new Error(
      `[ai-i18n] failed to parse ${id}: ${errors.map(formatError).join('; ')}`,
    );
  }

  const registrationBlock = writableScriptBlock(descriptor);
  const macroCalls = findMacroCalls(descriptor, id);
  const registration = registrationBlock
    ? { offset: registrationBlock.loc.start.offset }
    : {
        offset: 0,
        prefix: '<script setup>\n',
        suffix: '</script>\n',
      };

  if (!descriptor.scriptSetup || descriptor.scriptSetup.src) {
    const script = descriptor.script;
    return {
      code: script && !script.src ? script.content : '',
      lang: scriptLanguage(script?.lang),
      mapLocation: script
        ? createBlockLocationMapper(script)
        : identityLocation,
      registration,
      macroCalls,
    };
  }

  try {
    // compiler-sfc 同时保留 setup、模板局部作用域和双 script 的真实语义。
    const compiled = compiler.compileScript(descriptor, {
      id,
      inlineTemplate: true,
      sourceMap: true,
    });
    return {
      code: compiled.content,
      lang: scriptLanguage(compiled.lang),
      mapLocation: compiled.map
        ? createSourceMapLocationMapper(compiled.map as unknown as RawSourceMap)
        : identityLocation,
      registration,
      macroCalls,
    };
  } catch (error) {
    throw new Error(`[ai-i18n] failed to compile ${id}: ${formatError(error)}`);
  }
}

function findMacroCalls(
  descriptor: SFCDescriptor,
  id: string,
): DefineI18nMessagesCall[] {
  return [descriptor.script, descriptor.scriptSetup].flatMap((block, index) => {
    if (!block || block.src) return [];
    const module = analyzeModule(
      block.content,
      `${id}?macro=${index}`,
      undefined,
      scriptLanguage(block.lang),
    );
    return findDefineI18nMessagesCalls(module).map((call) => ({
      start: call.start + block.loc.start.offset,
      end: call.end + block.loc.start.offset,
      argument: call.argument
        ? {
            start: call.argument.start + block.loc.start.offset,
            end: call.argument.end + block.loc.start.offset,
          }
        : null,
    }));
  });
}

function createSourceMapLocationMapper(map: RawSourceMap) {
  const consumer = new SourceMapConsumer(map);
  return (location: SourceLocation): SourceLocation => {
    const original = consumer.originalPositionFor(location);
    return original.line == null || original.column == null
      ? location
      : { line: original.line, column: original.column };
  };
}

function createBlockLocationMapper(block: SFCBlock) {
  return (location: SourceLocation): SourceLocation => ({
    line: block.loc.start.line + location.line - 1,
    column:
      location.column + (location.line === 1 ? block.loc.start.column - 1 : 0),
  });
}

function writableScriptBlock(descriptor: SFCDescriptor): SFCBlock | null {
  if (descriptor.script && !descriptor.script.src) return descriptor.script;
  if (descriptor.scriptSetup && !descriptor.scriptSetup.src) {
    return descriptor.scriptSetup;
  }
  return null;
}

function scriptLanguage(lang: string | undefined): AnalysisLanguage {
  return lang === 'ts' || lang === 'tsx' || lang === 'jsx' ? lang : 'js';
}

function identityLocation(location: SourceLocation): SourceLocation {
  return location;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
