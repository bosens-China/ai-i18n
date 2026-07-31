import type { SFCBlock, SFCDescriptor } from '@vue/compiler-sfc';
import { diagnosticMessage } from './diagnostics.js';
import type { SourceLocation } from './index.js';
import type { VueTemplateRuntimeBinding } from './vue-runtime-template-bindings.js';
import type { VueAnalysisSource, VueRegistrationInsertion } from './vue.js';

export function createRegistrationTarget(descriptor: SFCDescriptor): {
  insertion: VueRegistrationInsertion;
  templateInsertion?: VueRegistrationInsertion;
  exposesTemplateBindings: boolean;
} {
  const scriptInsertion =
    descriptor.script && !descriptor.script.src
      ? blockInsertion(descriptor.script)
      : undefined;
  const setupInsertion =
    descriptor.scriptSetup && !descriptor.scriptSetup.src
      ? blockInsertion(descriptor.scriptSetup)
      : undefined;
  if (scriptInsertion) {
    return {
      insertion: scriptInsertion,
      ...(setupInsertion
        ? { templateInsertion: setupInsertion }
        : descriptor.template && !descriptor.scriptSetup
          ? { templateInsertion: syntheticSetupInsertion(descriptor) }
          : {}),
      exposesTemplateBindings: Boolean(
        setupInsertion || (descriptor.template && !descriptor.scriptSetup),
      ),
    };
  }
  if (setupInsertion) {
    return {
      insertion: setupInsertion,
      templateInsertion: setupInsertion,
      exposesTemplateBindings: true,
    };
  }
  if (descriptor.template && !descriptor.scriptSetup) {
    const insertion = syntheticSetupInsertion(descriptor);
    return {
      insertion,
      templateInsertion: insertion,
      exposesTemplateBindings: true,
    };
  }
  return {
    insertion: {
      offset: 0,
      prefix: '<script setup>\n',
      suffix: '</script>\n',
    },
    exposesTemplateBindings: !descriptor.scriptSetup,
  };
}

function syntheticSetupInsertion(
  descriptor: SFCDescriptor,
): VueRegistrationInsertion {
  return {
    offset: 0,
    prefix: `<script setup${
      descriptor.script?.lang
        ? ` lang=${JSON.stringify(descriptor.script.lang)}`
        : ''
    }>\n`,
    suffix: '</script>\n',
  };
}

function blockInsertion(block: SFCBlock): VueRegistrationInsertion {
  return {
    offset: block.loc.start.offset,
    ...(block.content.startsWith('\n') ? { prefix: '\n' } : {}),
  };
}

export function analyzableTemplate(descriptor: SFCDescriptor): SFCBlock | null {
  const template = descriptor.template;
  return template &&
    !template.src &&
    (!template.lang || template.lang === 'html')
    ? template
    : null;
}

export function templateImportMetadata(
  runtimeBinding: VueTemplateRuntimeBinding | null,
): Pick<VueAnalysisSource, 'templateAutoImportCandidates' | 'templateImports'> {
  // 显式 script-setup import 已天然暴露给模板，不能再次生成同名 import。
  return runtimeBinding === 'auto-import'
    ? { templateAutoImportCandidates: ['t'] }
    : {};
}

export function createTemplateOnlyLocationMapper(
  templateMapper: (location: SourceLocation) => SourceLocation,
  templateLineOffset: number,
  templateLineCount: number,
) {
  return (location: SourceLocation): SourceLocation =>
    location.line > templateLineOffset &&
    location.line <= templateLineOffset + templateLineCount
      ? templateMapper({
          line: location.line - templateLineOffset,
          column: location.column,
        })
      : location;
}

export function vueCompileError(id: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    diagnosticMessage(
      `[ai-i18n] 编译 ${id} 失败：${detail}`,
      `[ai-i18n] Failed to compile ${id}: ${detail}`,
    ),
    { cause: error },
  );
}
