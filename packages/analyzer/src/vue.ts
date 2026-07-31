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
import {
  analyzableTemplate,
  createRegistrationTarget,
  createTemplateOnlyLocationMapper,
  templateImportMetadata,
  vueCompileError,
} from './vue-analysis-support.js';
import { findVueTemplateRuntimeBinding } from './vue-runtime-template-bindings.js';
import {
  createInlineTemplateRuntimeAnalysis,
  createOrdinarySetupTemplateAnalysis,
} from './vue-setup-template.js';

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
  autoImportCode: string;
  autoImportLang: AnalysisLanguage;
  mapLocation(location: SourceLocation): SourceLocation;
  registration: VueRegistrationInsertion;
  templateRegistration?: VueRegistrationInsertion;
  macroCalls: DefineI18nMessagesCall[];
  templateAutoImportCandidates?: readonly string[];
  templateImports?: readonly string[];
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

  const macroCalls = findMacroCalls(descriptor, id);
  const registrationTarget = createRegistrationTarget(descriptor);
  const registrationMetadata = {
    registration: registrationTarget.insertion,
    ...(registrationTarget.templateInsertion
      ? { templateRegistration: registrationTarget.templateInsertion }
      : {}),
  };
  const autoImportBlocks = [descriptor.script, descriptor.scriptSetup].flatMap(
    (block) => (block && !block.src ? [block] : []),
  );
  const autoImportMetadata = {
    autoImportCode: autoImportBlocks.map((block) => block.content).join('\n'),
    autoImportLang: scriptLanguage(
      descriptor.scriptSetup?.lang ?? descriptor.script?.lang,
    ),
  };

  if (!descriptor.scriptSetup || descriptor.scriptSetup.src) {
    const script = descriptor.script;
    const templateBlock = analyzableTemplate(descriptor);
    if (!script && templateBlock) {
      try {
        const compiledTemplate = compiler.compileTemplate({
          source: templateBlock.content,
          filename: id,
          id,
        });
        if (compiledTemplate.errors.length) {
          throw new Error(compiledTemplate.errors.map(formatError).join('; '));
        }
        const analysis =
          compiledTemplate.map && registrationTarget.exposesTemplateBindings
            ? createOrdinarySetupTemplateAnalysis(
                '',
                [],
                compiledTemplate.code,
                'auto-import',
              )
            : null;
        if (analysis) {
          const scope = uniqueAnalysisName(
            '__aiI18nTemplate',
            compiledTemplate.code,
          );
          const prefix = `function ${scope}() {\n`;
          return {
            code: `${prefix}${analysis.templateCode}\n}\n${analysis.bridgeCode}`,
            lang: 'js',
            ...autoImportMetadata,
            mapLocation: createTemplateOnlyLocationMapper(
              createBlockSourceMapLocationMapper(
                templateBlock,
                compiledTemplate.map as unknown as RawSourceMap,
              ),
              countLines(prefix) - 1,
              countLines(analysis.templateCode),
            ),
            ...registrationMetadata,
            macroCalls,
            ...templateImportMetadata(analysis.runtimeBinding),
          };
        }
      } catch (error) {
        throw vueCompileError(id, error);
      }
    }
    if (!script || script.src || !templateBlock) {
      return {
        code: script && !script.src ? script.content : '',
        lang: scriptLanguage(script?.lang),
        ...autoImportMetadata,
        mapLocation: script
          ? createBlockLocationMapper(script)
          : identityLocation,
        ...registrationMetadata,
        macroCalls,
      };
    }
    try {
      const compiledScript = compiler.compileScript(descriptor, {
        id,
        sourceMap: true,
      });
      const compiledTemplate = compiler.compileTemplate({
        source: templateBlock.content,
        filename: id,
        id,
        preprocessLang:
          templateBlock.lang === 'html' ? undefined : templateBlock.lang,
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
      const scriptAst = compiledScript.scriptAst ?? [];
      const runtimeBinding = registrationTarget.exposesTemplateBindings
        ? findVueTemplateRuntimeBinding([scriptAst])
        : null;
      const templateAnalysis = compiledTemplate.map
        ? createOrdinarySetupTemplateAnalysis(
            script.content,
            scriptAst,
            compiledTemplate.code,
            runtimeBinding,
          )
        : null;
      if (templateAnalysis) {
        const scope = uniqueAnalysisName(
          '__aiI18nTemplate',
          script.content,
          compiledTemplate.code,
        );
        const prefix = `${script.content}\nfunction ${scope}() {\n`;
        const code = `${prefix}${templateAnalysis.templateCode}\n}\n${templateAnalysis.bridgeCode}`;
        const templateMapper = createBlockSourceMapLocationMapper(
          templateBlock,
          compiledTemplate.map as unknown as RawSourceMap,
        );
        return {
          code,
          lang: scriptLanguage(script.lang),
          ...autoImportMetadata,
          mapLocation: createCombinedLocationMapper(
            script,
            templateMapper,
            countLines(prefix) - 1,
            countLines(templateAnalysis.templateCode),
          ),
          ...registrationMetadata,
          macroCalls,
          ...templateImportMetadata(templateAnalysis.runtimeBinding),
        };
      }
    } catch (error) {
      throw vueCompileError(id, error);
    }
    return {
      code: script.content,
      lang: scriptLanguage(script.lang),
      ...autoImportMetadata,
      mapLocation: createBlockLocationMapper(script),
      ...registrationMetadata,
      macroCalls,
    };
  }

  try {
    // 自动导入分析必须保留普通 script 的模块作用域与 setup 的函数作用域，
    // 否则 setup 局部变量会错误遮蔽普通 script 中同名的未绑定 Runtime API。
    const autoImportCompiled = compiler.compileScript(descriptor, {
      id,
    });
    // compiler-sfc 同时保留 setup、模板局部作用域和双 script 的真实语义。
    const compiled = compiler.compileScript(descriptor, {
      id,
      inlineTemplate: true,
      sourceMap: true,
    });
    const scriptAst = compiled.scriptAst ?? [];
    const runtimeBinding = registrationTarget.exposesTemplateBindings
      ? findVueTemplateRuntimeBinding([
          scriptAst,
          compiled.scriptSetupAst ?? [],
        ])
      : null;
    const analysis = createInlineTemplateRuntimeAnalysis(
      compiled.content,
      runtimeBinding,
      scriptLanguage(compiled.lang),
    );
    return {
      code: analysis.code,
      lang: scriptLanguage(compiled.lang),
      ...autoImportMetadata,
      autoImportCode: autoImportCompiled.content,
      autoImportLang: scriptLanguage(autoImportCompiled.lang),
      mapLocation: compiled.map
        ? createSourceMapLocationMapper(compiled.map as unknown as RawSourceMap)
        : identityLocation,
      ...registrationMetadata,
      macroCalls,
      ...templateImportMetadata(analysis.runtimeBinding),
    };
  } catch (error) {
    throw vueCompileError(id, error);
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
