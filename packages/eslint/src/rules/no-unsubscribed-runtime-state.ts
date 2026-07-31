import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { Rule } from 'eslint';
import {
  isImmediateConsoleEffect,
  isVueTemplateEventHandler,
  nearestFunction,
  type ParentNode,
} from './ast-context.js';
import { isInsideOptionsComputedGetter } from './vue-options.js';

const RUNTIME_MODULE = 'virtual:ai-i18n';
const STATE_APIS = ['getLang', 'getLangLoadState'] as const;

type RuntimeStateApi = (typeof STATE_APIS)[number];

interface RuleOptions {
  autoImport?: boolean | readonly RuntimeStateApi[];
  framework?: 'react' | 'vue';
}

export const noUnsubscribedRuntimeState: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '检查模块和组件渲染路径中的 Runtime 状态快照',
    },
    schema: [
      {
        type: 'object',
        properties: {
          autoImport: {
            anyOf: [
              { type: 'boolean' },
              {
                type: 'array',
                items: { enum: STATE_APIS },
                uniqueItems: true,
              },
            ],
          },
          framework: { enum: ['react', 'vue'] },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      moduleSnapshot: diagnosticMessage(
        '模块顶层调用 {{api}}() 只会保存初始化时的状态快照，后续语言状态变化不会更新该值。请在需要时调用，或通过 subscribe() / useI18n() 建立订阅。',
        'Calling {{api}}() at module scope stores only the initialization snapshot, which will not update after language state changes. Read it when needed, or subscribe through subscribe() / useI18n().',
      ),
      renderSnapshot: diagnosticMessage(
        '组件渲染期间调用 {{api}}() 不会订阅语言状态。请使用 useI18n() 返回的 {{replacement}}。',
        'Calling {{api}}() while rendering a component does not subscribe to language state. Use {{replacement}} from useI18n().',
      ),
      vueRenderSnapshot: diagnosticMessage(
        'Vue 渲染期间调用 {{api}}() 不会订阅语言状态。Composition API 请使用 useI18n() 返回的 {{replacement}}；纯 Options API 请在 computed 中展开 ...i18nComputed() 后使用 {{replacement}}。',
        'Calling {{api}}() while rendering Vue does not subscribe to language state. With the Composition API, use {{replacement}} from useI18n(); with the pure Options API, spread ...i18nComputed() into computed and use {{replacement}}.',
      ),
      optionsComputedSnapshot: diagnosticMessage(
        '纯 Options API 的 computed 中调用 {{api}}() 仍然只会读取快照。请改为在 computed 中展开 ...i18nComputed()，并直接使用响应式的 {{replacement}}。',
        'Calling {{api}}() inside a pure Options API computed getter still reads only a snapshot. Spread ...i18nComputed() into computed and use the reactive {{replacement}} instead.',
      ),
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    const autoImports = normalizeAutoImports(options.autoImport);
    const importedBindings = new Map<string, RuntimeStateApi>();
    const jsxOwners = new Set<ParentNode>();
    const templateCalls = new Set<Rule.Node>();
    const candidates: Rule.Node[] = [];
    const collectJsxOwner = (node: Rule.Node) => {
      const owner = nearestFunction(node);
      if (owner) jsxOwners.add(owner);
    };
    const collectCall = (node: Rule.Node) => {
      candidates.push(node);
    };
    const scriptVisitor: Rule.RuleListener = {
      CallExpression: collectCall,
      ImportDeclaration(node) {
        if (node.source.value !== RUNTIME_MODULE) return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : typeof specifier.imported.value === 'string'
                ? specifier.imported.value
                : null;
          if (STATE_APIS.includes(imported as RuntimeStateApi)) {
            importedBindings.set(
              specifier.local.name,
              imported as RuntimeStateApi,
            );
          }
        }
      },
      JSXElement: collectJsxOwner,
      JSXFragment: collectJsxOwner,
      'Program:exit'() {
        for (const node of candidates) {
          const api = runtimeStateApi(
            context,
            node,
            autoImports,
            importedBindings,
            templateCalls.has(node),
          );
          if (!api) continue;
          if (templateCalls.has(node)) {
            if (!isVueTemplateEventHandler(node)) {
              reportRenderSnapshot(context, node, api, true);
            }
            continue;
          }
          const owner = nearestFunction(node);
          if (!owner) {
            context.report({
              node,
              messageId: 'moduleSnapshot',
              data: { api },
            });
            continue;
          }
          if (
            options.framework === 'vue' &&
            isInsideOptionsComputedGetter(node, context)
          ) {
            reportOptionsComputedSnapshot(context, node, api);
            continue;
          }
          if (jsxOwners.has(owner) && !isImmediateConsoleEffect(node)) {
            reportRenderSnapshot(
              context,
              node,
              api,
              options.framework === 'vue',
            );
          }
        }
      },
    };
    const parserServices = context.sourceCode
      .parserServices as VueParserServices;
    if (!parserServices.defineTemplateBodyVisitor) return scriptVisitor;
    return parserServices.defineTemplateBodyVisitor(
      {
        CallExpression(node) {
          candidates.push(node);
          templateCalls.add(node);
        },
      },
      scriptVisitor,
      { templateBodyTriggerSelector: 'Program' },
    );
  },
};

function normalizeAutoImports(
  option: RuleOptions['autoImport'],
): ReadonlySet<RuntimeStateApi> {
  if (option === true) return new Set(STATE_APIS);
  if (!option) return new Set();
  return new Set(option);
}

function runtimeStateApi(
  context: Rule.RuleContext,
  rawNode: Rule.Node,
  autoImports: ReadonlySet<RuntimeStateApi>,
  importedBindings: ReadonlyMap<string, RuntimeStateApi>,
  inTemplate: boolean,
): RuntimeStateApi | null {
  if (rawNode.type !== 'CallExpression') return null;
  const callee = rawNode.callee;
  if (callee.type !== 'Identifier') return null;
  if (inTemplate) {
    if (isTemplateLocalIdentifier(callee as unknown as ParentNode)) return null;
    const imported = importedBindings.get(callee.name);
    if (imported) return imported;
    if (hasTopLevelScriptBinding(context, callee.name)) return null;
    return autoImports.has(callee.name as RuntimeStateApi)
      ? (callee.name as RuntimeStateApi)
      : null;
  }
  const variable = findVariable(
    context.sourceCode.getScope(
      callee as unknown as Rule.Node,
    ) as unknown as ScopeLike,
    callee.name,
  );
  if (variable?.defs.length) {
    const imported = importedRuntimeStateApi(variable);
    return imported;
  }
  return autoImports.has(callee.name as RuntimeStateApi)
    ? (callee.name as RuntimeStateApi)
    : null;
}

function importedRuntimeStateApi(
  variable: VariableLike,
): RuntimeStateApi | null {
  for (const definition of variable.defs) {
    if (definition.type !== 'ImportBinding') continue;
    const specifier = definition.node as ImportSpecifierNode;
    const declaration = specifier.parent;
    if (
      specifier.type !== 'ImportSpecifier' ||
      declaration?.type !== 'ImportDeclaration' ||
      declaration.source.value !== RUNTIME_MODULE
    ) {
      continue;
    }
    const imported =
      specifier.imported.type === 'Identifier'
        ? specifier.imported.name
        : typeof specifier.imported.value === 'string'
          ? specifier.imported.value
          : null;
    return STATE_APIS.includes(imported as RuntimeStateApi)
      ? (imported as RuntimeStateApi)
      : null;
  }
  // ESLint globals 没有 definition；只有显式开启 autoImport 时才由调用方接纳。
  return null;
}

function hasTopLevelScriptBinding(
  context: Rule.RuleContext,
  name: string,
): boolean {
  return context.sourceCode.scopeManager.scopes.some(
    (scope) =>
      (scope.type === 'global' || scope.type === 'module') &&
      scope.variables.some(
        (variable) => variable.name === name && variable.defs.length > 0,
      ),
  );
}

function isTemplateLocalIdentifier(identifier: ParentNode): boolean {
  let current: TemplateTraversableNode | null =
    identifier as unknown as TemplateTraversableNode;
  while (current) {
    if (current.type === 'VExpressionContainer') {
      const container = current as unknown as TemplateExpressionContainer;
      return container.references.some(
        (reference) =>
          reference.id === identifier && reference.variable !== null,
      );
    }
    current = current.parent;
  }
  return false;
}

function findVariable(scope: ScopeLike, name: string): VariableLike | null {
  let current: ScopeLike | null = scope;
  while (current) {
    const variable = current.variables.find((item) => item.name === name);
    if (variable) return variable;
    current = current.upper;
  }
  return null;
}

function reportRenderSnapshot(
  context: Rule.RuleContext,
  node: Rule.Node,
  api: RuntimeStateApi,
  isVue: boolean,
) {
  context.report({
    node,
    messageId: isVue ? 'vueRenderSnapshot' : 'renderSnapshot',
    data: {
      api,
      replacement: api === 'getLang' ? 'currentLang' : 'langLoadState',
    },
  });
}

function reportOptionsComputedSnapshot(
  context: Rule.RuleContext,
  node: Rule.Node,
  api: RuntimeStateApi,
) {
  context.report({
    node,
    messageId: 'optionsComputedSnapshot',
    data: {
      api,
      replacement: api === 'getLang' ? 'currentLang' : 'langLoadState',
    },
  });
}

type ImportSpecifierNode = Extract<Rule.Node, { type: 'ImportSpecifier' }> & {
  parent: ParentNode | null;
};

interface DefinitionLike {
  type: string;
  node: unknown;
}

interface VariableLike {
  name: string;
  defs: readonly DefinitionLike[];
}

interface ScopeLike {
  variables: readonly VariableLike[];
  upper: ScopeLike | null;
}

interface TemplateTraversableNode {
  type: string;
  parent: TemplateTraversableNode | null;
}

interface TemplateExpressionContainer {
  references: Array<{
    id: unknown;
    variable: unknown | null;
  }>;
}

interface VueParserServices {
  defineTemplateBodyVisitor?(
    templateBodyVisitor: Record<string, (node: Rule.Node) => void>,
    scriptVisitor: Rule.RuleListener,
    options: { templateBodyTriggerSelector: 'Program' | 'Program:exit' },
  ): Rule.RuleListener;
}
