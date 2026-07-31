import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { Rule } from 'eslint';
import { reportAnalysisFailureOnce } from '../rule-analysis.js';
import {
  matchTranslationCalls,
  type TranslationCandidate,
  type TranslationRuleOptions,
} from './translation-call.js';
import {
  isImmediateConsoleEffect,
  isVueTemplateEventHandler,
  nearestFunction,
  type ParentNode,
} from './ast-context.js';
import { resolveVueInstanceMemberOrigin } from './vue-instance-member.js';
import { isOptionsComputedValue, vueOptionsSection } from './vue-options.js';

interface RuleOptions extends TranslationRuleOptions {
  framework?: 'react' | 'vue';
}

export const noUnsubscribedT: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: '检查组件渲染路径中的翻译 API 生命周期',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tsconfigPath: { type: 'string' },
          autoImport: {
            anyOf: [
              { type: 'boolean' },
              {
                type: 'array',
                items: { enum: ['t', 'tRef', 'tComputed', 'useI18n'] },
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
      unsubscribedT: diagnosticMessage(
        '组件渲染期间使用顶层 t 不会订阅语言状态，语言切换不会主动刷新，缓存的渲染结果也可能继续使用旧译文。请使用 useI18n() 返回的 t。',
        'Top-level t does not subscribe the component to language updates, so language changes do not trigger a render and cached render results may remain stale. Use the t returned by useI18n().',
      ),
      renderTRef: diagnosticMessage(
        '不要在组件渲染或 template 中调用 tRef()，否则每次渲染都会创建新的 computed。请在 setup 中创建一次并使用返回的 Ref；Vue 渲染函数中请直接调用 t。',
        'Do not call tRef() during component rendering or in a template because each render creates a new computed. Create it once in setup and use the returned Ref; call t directly in Vue render functions.',
      ),
      misplacedTComputed: diagnosticMessage(
        'tComputed() 只应直接作为纯 Options API 的 computed 属性值使用，例如 computed: { label: tComputed("保存") }。setup 中请使用 tRef()，template 或 render 中请直接使用 t()。',
        'Use tComputed() only as the direct value of a pure Options API computed property, for example computed: { label: tComputed("Save") }. Use tRef() in setup, and call t() directly in templates or render functions.',
      ),
      optionsTRef: diagnosticMessage(
        '不要在纯 Options API 的 computed、data 或 methods 中调用 tRef()。computed 请直接使用 tComputed()，methods 请在执行时调用 t()；tRef() 仅用于 setup 或 composable。',
        'Do not call tRef() in pure Options API computed, data, or methods. Use tComputed() directly in computed properties, call t() when a method runs, and reserve tRef() for setup or composables.',
      ),
      unsupportedInstanceTranslation: diagnosticMessage(
        'ai-i18n 不支持把 Vue 组件实例成员 this.t / this.$t 当作翻译 API。请直接调用词法作用域中的 t()；开启自动导入时无需 import，关闭时请从 virtual:ai-i18n 显式导入。',
        'ai-i18n does not support Vue instance members this.t or this.$t as translation APIs. Call lexical t() directly; no import is needed with auto import enabled, otherwise import it from virtual:ai-i18n.',
      ),
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as RuleOptions;
    const candidates: TranslationCandidate[] = [];
    const jsxOwners = new Set<ParentNode>();
    const templateNodes = new Set<Rule.Node>();
    const collectJsxOwner = (node: Rule.Node) => {
      const owner = nearestFunction(node);
      if (owner) jsxOwners.add(owner);
    };
    const scriptVisitor: Rule.RuleListener = {
      CallExpression(node) {
        candidates.push({ kind: 'call', node });
      },
      TaggedTemplateExpression(node) {
        candidates.push({ kind: 'tagged-template', node });
      },
      MemberExpression(node) {
        reportUnsupportedVueInstanceTranslation(context, node, options, false);
      },
      JSXElement: collectJsxOwner,
      JSXFragment: collectJsxOwner,
      'Program:exit'(program) {
        let matches;
        try {
          matches = matchTranslationCalls(context, options, candidates);
        } catch (error) {
          reportAnalysisFailureOnce(context, program as Rule.Node, error);
          return;
        }
        for (const { call, node } of matches) {
          if (call.origin === 'vue-computed') {
            if (!isOptionsComputedValue(node, context)) {
              context.report({ node, messageId: 'misplacedTComputed' });
            }
            continue;
          }
          if (call.origin === 'vue-ref') {
            if (templateNodes.has(node)) {
              if (!isVueTemplateEventHandler(node)) {
                context.report({ node, messageId: 'renderTRef' });
              }
              continue;
            }
            const section = vueOptionsSection(node, context);
            if (
              section === 'computed' ||
              section === 'data' ||
              section === 'methods'
            ) {
              context.report({ node, messageId: 'optionsTRef' });
              continue;
            }
            if (section === 'render') {
              context.report({ node, messageId: 'renderTRef' });
              continue;
            }
            const owner = nearestFunction(node);
            if (owner && jsxOwners.has(owner)) {
              context.report({ node, messageId: 'renderTRef' });
            }
            continue;
          }
          if (call.origin !== 'runtime') continue;
          if (options.framework === 'vue') continue;
          if (templateNodes.has(node)) {
            // Vue 模式的顶层 t 会读取 adapter revision，模板渲染时会建立响应式依赖。
            continue;
          }
          // ponytail: 先检查直接拥有 JSX 的最近函数；出现真实漏报后再引入调用图与框架数据流。
          const owner = nearestFunction(node);
          if (
            !owner ||
            !jsxOwners.has(owner) ||
            isImmediateConsoleEffect(node)
          ) {
            continue;
          }
          context.report({ node, messageId: 'unsubscribedT' });
        }
      },
    };
    const parserServices = context.sourceCode
      .parserServices as VueParserServices;
    if (!parserServices.defineTemplateBodyVisitor) return scriptVisitor;
    return parserServices.defineTemplateBodyVisitor(
      {
        CallExpression(node) {
          candidates.push({ kind: 'call', node });
          templateNodes.add(node);
        },
        TaggedTemplateExpression(node) {
          candidates.push({ kind: 'tagged-template', node });
          templateNodes.add(node);
        },
        MemberExpression(node) {
          reportUnsupportedVueInstanceTranslation(context, node, options, true);
        },
      },
      scriptVisitor,
      // 模板默认在 Program:exit 才遍历；提前到 Program，确保汇总前已收集候选。
      { templateBodyTriggerSelector: 'Program' },
    );
  },
};

function reportUnsupportedVueInstanceTranslation(
  context: Rule.RuleContext,
  node: Rule.Node,
  options: RuleOptions,
  inTemplate: boolean,
): void {
  if (options.framework !== 'vue') return;
  const name = vueInstanceTranslationMemberName(node);
  if (!name) return;
  const origin = resolveVueInstanceMemberOrigin(
    context,
    node,
    name,
    inTemplate,
  );
  if (
    origin === 'local' ||
    origin === 'unknown' ||
    origin === 'not-component'
  ) {
    return;
  }
  context.report({ node, messageId: 'unsupportedInstanceTranslation' });
}

function vueInstanceTranslationMemberName(node: Rule.Node): 't' | '$t' | null {
  if (
    node.type !== 'MemberExpression' ||
    node.object.type !== 'ThisExpression'
  ) {
    return null;
  }
  const name =
    !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : node.computed &&
          node.property.type === 'Literal' &&
          typeof node.property.value === 'string'
        ? node.property.value
        : null;
  return name === 't' || name === '$t' ? name : null;
}

interface VueParserServices {
  defineTemplateBodyVisitor?(
    templateBodyVisitor: Record<string, (node: Rule.Node) => void>,
    scriptVisitor: Rule.RuleListener,
    options: { templateBodyTriggerSelector: 'Program' | 'Program:exit' },
  ): Rule.RuleListener;
}
