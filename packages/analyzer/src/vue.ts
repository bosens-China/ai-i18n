import type {
  compileTemplate as compileVueTemplate,
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
import { diagnosticMessage } from './diagnostics.js';
import { createOrdinarySetupTemplateAnalysis } from './vue-setup-template.js';

export interface VueCompiler {
  parse: typeof parseVue;
  compileScript: typeof compileVueScript;
  compileTemplate: typeof compileVueTemplate;
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
      diagnosticMessage(
        `[ai-i18n] 解析 ${id} 失败：${errors.map(formatError).join('；')}`,
        `[ai-i18n] Failed to parse ${id}: ${errors.map(formatError).join('; ')}`,
      ),
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
    if (
      !script ||
      script.src ||
      !descriptor.template ||
      descriptor.template.src ||
      (descriptor.template.lang && descriptor.template.lang !== 'html')
    ) {
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
      const compiledScript = compiler.compileScript(descriptor, {
        id,
        sourceMap: true,
      });
      const compiledTemplate = compiler.compileTemplate({
        source: descriptor.template.content,
        filename: id,
        id,
        preprocessLang:
          descriptor.template.lang === 'html'
            ? undefined
            : descriptor.template.lang,
        compilerOptions: {
          bindingMetadata: compiledScript.bindings,
          expressionPlugins: /tsx?$/.test(script.lang ?? '')
            ? ['typescript']
            : undefined,
          sourceMap: true,
        },
      });
      if (compiledTemplate.errors.length) {
        throw new Error(compiledTemplate.errors.map(formatError).join('; '));
      }
      // 普通 script 只在编译器能提供模板源码映射时扩展分析，避免产生错误诊断位置。
      const template = compiledTemplate.map
        ? createOrdinarySetupTemplateAnalysis(
            script.content,
            compiledScript.scriptAst ?? [],
            compiledTemplate.code,
          )
        : null;
      if (template) {
        const scope = uniqueAnalysisName(
          '__aiI18nTemplate',
          script.content,
          compiledTemplate.code,
        );
        const prefix = `${script.content}\nfunction ${scope}() {\n`;
        const code = `${prefix}${template.templateCode}\n}\n${template.bridgeCode}`;
        const templateMapper = createBlockSourceMapLocationMapper(
          descriptor.template,
          compiledTemplate.map as unknown as RawSourceMap,
        );
        return {
          code,
          lang: scriptLanguage(script.lang),
          mapLocation: createCombinedLocationMapper(
            script,
            templateMapper,
            countLines(prefix) - 1,
            countLines(template.templateCode),
          ),
          registration,
          macroCalls,
        };
      }
    } catch (error) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] 编译 ${id} 失败：${formatError(error)}`,
          `[ai-i18n] Failed to compile ${id}: ${formatError(error)}`,
        ),
        { cause: error },
      );
    }
    return {
      code: script.content,
      lang: scriptLanguage(script.lang),
      mapLocation: createBlockLocationMapper(script),
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
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] 编译 ${id} 失败：${formatError(error)}`,
        `[ai-i18n] Failed to compile ${id}: ${formatError(error)}`,
      ),
      { cause: error },
    );
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

function createBlockSourceMapLocationMapper(
  block: SFCBlock,
  map: RawSourceMap,
) {
  const mapLocation = createSourceMapLocationMapper(map);
  const mapBlockLocation = createBlockLocationMapper(block);
  return (location: SourceLocation): SourceLocation =>
    mapBlockLocation(mapLocation(location));
}

function createCombinedLocationMapper(
  script: SFCBlock,
  templateMapper: (location: SourceLocation) => SourceLocation,
  templateLineOffset: number,
  templateLineCount: number,
) {
  const scriptMapper = createBlockLocationMapper(script);
  const scriptLineCount = countLines(script.content);
  return (location: SourceLocation): SourceLocation => {
    if (location.line <= scriptLineCount) return scriptMapper(location);
    if (
      location.line > templateLineOffset &&
      location.line <= templateLineOffset + templateLineCount
    ) {
      return templateMapper({
        line: location.line - templateLineOffset,
        column: location.column,
      });
    }
    return location;
  };
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

function countLines(value: string): number {
  return value.split('\n').length;
}

function uniqueAnalysisName(
  base: string,
  ...sources: readonly string[]
): string {
  let name = base;
  let index = 0;
  while (sources.some((source) => source.includes(name))) {
    name = `${base}${++index}`;
  }
  return name;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
