import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { ChatOpenAI } from '@langchain/openai';
import { Client } from 'langsmith';
import type {
  TranslationMessage,
  TranslationResult,
  TranslationValue,
  Translator,
} from '@ai-i18n/core';
import { hasSameTemplateTokens } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';

export interface LangSmithOptions {
  apiKey: string;
  project?: string;
  endpoint?: string;
  workspaceId?: string;
}

export interface OpenAIOptions {
  /** OpenAI-compatible API 根地址，例如 `https://example.com/v1`。 */
  baseURL: string;
  /** 模型名必须由使用者显式选择。 */
  model: string;
  /** 本地无认证服务可省略；Provider 不主动读取宿主环境变量。 */
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: HeadersInit;
  /** 覆盖默认翻译提示词；内部 JSON 输出约束始终追加在尾部。 */
  systemPrompt?: string;
  /** 传入即启用 LangSmith tracing。 */
  langSmith?: LangSmithOptions;
}

interface TranslationPayload {
  translations: Array<Record<string, TranslationValue>>;
}

const DEFAULT_SYSTEM_PROMPT =
  '你是一名专业的软件界面翻译助手。请把用户输入翻译为指定目标语言，并结合随正文提供的 comment 理解业务语境。保持 HTML、Markdown、ICU 语法、快捷键和产品名称不变；无法可靠翻译时返回 null。';

const TEMPLATE_PLACEHOLDER_RULE =
  '`{{0}}`、`{{1}}` 等不带等号的编号标记代表运行时插值，可以按目标语言语序调整位置；`{{=0}}`、`{{==0}}` 等带等号的编号标记代表转义后的字面文本。两类标记都必须原样保留且出现相同次数，不能互换。';

export function openAI(options: OpenAIOptions): Translator {
  const baseURL = requiredOption(options.baseURL, 'baseURL').replace(
    /\/+$/,
    '',
  );
  const modelName = requiredOption(options.model, 'model');
  const basePrompt =
    options.systemPrompt === undefined
      ? DEFAULT_SYSTEM_PROMPT
      : requiredOption(options.systemPrompt, 'systemPrompt');
  const temperature = nonNegativeNumber(
    options.temperature ?? 1,
    'temperature',
  );
  const timeout = positiveInteger(options.timeoutMs ?? 120_000, 'timeoutMs');
  const maxRetries = nonNegativeInteger(options.maxRetries ?? 3, 'maxRetries');
  const maxTokens = optionalPositiveInteger(options.maxTokens, 'maxTokens');
  const headers = options.headers
    ? normalizeHeaders(options.headers)
    : undefined;
  // 显式占位值可阻止 LangChain 把宿主 OPENAI_API_KEY 泄露给本地服务。
  const apiKey = options.apiKey?.trim() || 'local-no-auth';
  const callbacks = createLangSmithCallbacks(options.langSmith);

  const chatModel = new ChatOpenAI({
    model: modelName,
    apiKey,
    temperature,
    timeout,
    maxRetries,
    maxTokens,
    useResponsesApi: false,
    ...(callbacks ? { callbacks } : {}),
    configuration: {
      baseURL,
      ...(headers ? { defaultHeaders: headers } : {}),
    },
  });

  return async ({ locales, messages }) => {
    if (messages.length === 0) return [];
    if (!locales.length || new Set(locales).size !== locales.length) {
      throw new Error(
        diagnosticMessage(
          '[ai-i18n/openai] 目标语言列表无效',
          '[ai-i18n/openai] invalid target locales',
        ),
      );
    }
    const systemPrompt = `${basePrompt}\n\n${TEMPLATE_PLACEHOLDER_RULE}\n\n${outputInstructions(locales, messages.length)}`;
    const model = chatModel.withStructuredOutput<TranslationPayload>(
      translationSchema(locales, messages.length),
      {
        name: 'ai_i18n_translations',
        method: 'jsonMode',
      },
    );

    let payload: TranslationPayload;
    try {
      payload = await model.invoke([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify(messages),
        },
      ]);
    } catch (error) {
      throw safeProviderError(error);
    }
    return validateResults(messages, locales, parsePayload(payload));
  };
}

function outputInstructions(locales: readonly string[], rowCount: number) {
  const example = {
    translations: [Object.fromEntries(locales.map((locale) => [locale, '']))],
  };
  return [
    `目标语言：${locales.join('、')}。`,
    '用户输入是对象数组；每项包含 source 和可选的 comment。只翻译 source，comment 仅用于理解业务语境，不得出现在译文中。',
    `返回 JSON 对象，其中 translations 是长度为 ${rowCount} 的数组，并与输入下标一一对应。每项必须且只能包含这些语言键：${locales.join('、')}。`,
    `不要使用 Markdown 或添加解释。格式示例：${JSON.stringify(example)}`,
  ].join('\n');
}

function translationSchema(locales: readonly string[], rowCount: number) {
  const properties = Object.fromEntries(
    locales.map((locale) => [locale, { type: ['string', 'null'] }]),
  );
  return {
    type: 'object',
    properties: {
      translations: {
        type: 'array',
        minItems: rowCount,
        maxItems: rowCount,
        items: {
          type: 'object',
          properties,
          required: locales,
          additionalProperties: false,
        },
      },
    },
    required: ['translations'],
    additionalProperties: false,
  } as const;
}

function createLangSmithCallbacks(options: LangSmithOptions | undefined) {
  if (!options) return undefined;
  const client = new Client({
    apiKey: requiredOption(options.apiKey, 'langSmith.apiKey'),
    ...(optionalOption(options.endpoint)
      ? { apiUrl: options.endpoint!.trim() }
      : {}),
    ...(optionalOption(options.workspaceId)
      ? { workspaceId: options.workspaceId!.trim() }
      : {}),
  });
  return [
    new LangChainTracer({
      client,
      ...(optionalOption(options.project)
        ? { projectName: options.project!.trim() }
        : {}),
    }),
  ];
}

function parsePayload(
  value: unknown,
): readonly Record<string, TranslationValue>[] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['translations']) ||
    !Array.isArray(value.translations)
  ) {
    throw new Error('[ai-i18n/openai] invalid translation payload');
  }
  return value.translations as Array<Record<string, TranslationValue>>;
}

function validateResults(
  messages: readonly TranslationMessage[],
  locales: readonly string[],
  results: readonly Record<string, TranslationValue>[],
): TranslationResult[] {
  if (results.length !== messages.length) {
    throw new Error('[ai-i18n/openai] invalid translation result');
  }
  const expectedKeys = new Set(locales);
  const translated: TranslationResult[] = [];
  for (const [index, result] of results.entries()) {
    if (
      !isRecord(result) ||
      Object.keys(result).length !== expectedKeys.size ||
      Object.keys(result).some((key) => !expectedKeys.has(key))
    ) {
      throw new Error('[ai-i18n/openai] invalid translation result');
    }
    for (const locale of locales) {
      const value = result[locale];
      if (typeof value !== 'string' && value !== null) {
        throw new Error('[ai-i18n/openai] invalid translation result');
      }
      if (
        value !== null &&
        !hasSameTemplateTokens(messages[index]!.source, value)
      ) {
        throw new Error(
          '[ai-i18n/openai] translation result changed template placeholders',
        );
      }
    }
    translated.push(result);
  }
  return translated;
}

function safeProviderError(error: unknown): Error {
  if (isRecord(error) && typeof error.status === 'number') {
    return new Error(
      `[ai-i18n/openai] request failed with status ${error.status}`,
    );
  }
  return new Error('[ai-i18n/openai] translation request failed');
}

function requiredOption(value: string, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`[ai-i18n/openai] ${name} is required`);
  return normalized;
}

function optionalOption(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`[ai-i18n/openai] ${name} must be non-negative`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`[ai-i18n/openai] ${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `[ai-i18n/openai] ${name} must be a non-negative integer`,
    );
  }
  return value;
}

function optionalPositiveInteger(
  value: number | undefined,
  name: string,
): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, name);
}

function normalizeHeaders(value: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  new Headers(value).forEach((headerValue, name) => {
    normalized[name] = headerValue;
  });
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}
