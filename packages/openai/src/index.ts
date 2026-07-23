import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { ChatOpenAI } from '@langchain/openai';
import { Client } from 'langsmith';
import type {
  TranslationRequest,
  TranslationResult,
  Translator,
} from '@ai-i18n/core';

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
  translations: TranslationResult[];
}

const DEFAULT_SYSTEM_PROMPT =
  '你是一名专业的软件界面本地化译者。请将每条 source 翻译为请求指定的 locale，并结合 comment 判断语境。保持占位符、变量插值、HTML、Markdown、ICU 语法、快捷键和产品名称不变，不要添加解释；无法可靠翻译时返回 null。';

const JSON_OUTPUT_SUFFIX =
  '请仅以 JSON 返回，不要使用 Markdown 代码块或添加解释。最小示例：{"translations":[{"messageId":"save","locale":"en-US","value":"Save"}]}';

const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          messageId: { type: 'string' },
          locale: { type: 'string' },
          value: { type: ['string', 'null'] },
        },
        required: ['messageId', 'locale', 'value'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
} as const;

export function openAI(options: OpenAIOptions): Translator {
  const baseURL = requiredOption(options.baseURL, 'baseURL').replace(/\/+$/, '');
  const modelName = requiredOption(options.model, 'model');
  const basePrompt =
    options.systemPrompt === undefined
      ? DEFAULT_SYSTEM_PROMPT
      : requiredOption(options.systemPrompt, 'systemPrompt');
  const systemPrompt = `${basePrompt}\n\n${JSON_OUTPUT_SUFFIX}`;
  const temperature = nonNegativeNumber(
    options.temperature ?? 1,
    'temperature',
  );
  const timeout = positiveInteger(options.timeoutMs ?? 120_000, 'timeoutMs');
  const maxRetries = nonNegativeInteger(
    options.maxRetries ?? 3,
    'maxRetries',
  );
  const maxTokens = optionalPositiveInteger(options.maxTokens, 'maxTokens');
  const headers = options.headers ? normalizeHeaders(options.headers) : undefined;
  // 显式占位值可阻止 LangChain 把宿主 OPENAI_API_KEY 泄露给本地服务。
  const apiKey = options.apiKey?.trim() || 'local-no-auth';
  const callbacks = createLangSmithCallbacks(options.langSmith);

  const model = new ChatOpenAI({
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
  }).withStructuredOutput<TranslationPayload>(TRANSLATION_SCHEMA, {
    name: 'ai_i18n_translations',
    method: 'jsonSchema',
    strict: true,
  });

  return async (requests) => {
    if (requests.length === 0) return [];

    let payload: TranslationPayload;
    try {
      payload = await model.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ requests }) },
      ]);
    } catch (error) {
      throw safeProviderError(error);
    }
    return validateResults(requests, parsePayload(payload));
  };
}

function createLangSmithCallbacks(options: LangSmithOptions | undefined) {
  if (!options) return undefined;
  const client = new Client({
    apiKey: requiredOption(options.apiKey, 'langSmith.apiKey'),
    ...(optionalOption(options.endpoint) ? { apiUrl: options.endpoint!.trim() } : {}),
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

function parsePayload(value: unknown): readonly TranslationResult[] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['translations']) ||
    !Array.isArray(value.translations)
  ) {
    throw new Error('[ai-i18n/openai] invalid translation payload');
  }
  return value.translations as TranslationResult[];
}

function validateResults(
  requests: readonly TranslationRequest[],
  results: readonly TranslationResult[],
): TranslationResult[] {
  // Provider 返回值必须与批次一一对应，避免错误结果进入 Translation Memory。
  const expected = new Map(
    requests.map((request) => [requestKey(request), request]),
  );
  const received = new Map<string, TranslationResult>();
  if (expected.size !== requests.length) {
    throw new Error('[ai-i18n/openai] invalid translation request');
  }

  for (const result of results) {
    if (
      !isRecord(result) ||
      !hasExactKeys(result, ['messageId', 'locale', 'value']) ||
      typeof result.messageId !== 'string' ||
      typeof result.locale !== 'string' ||
      (typeof result.value !== 'string' && result.value !== null)
    ) {
      throw new Error('[ai-i18n/openai] invalid translation result');
    }
    const key = requestKey(result);
    if (!expected.has(key) || received.has(key)) {
      throw new Error('[ai-i18n/openai] invalid translation result');
    }
    received.set(key, result);
  }

  if (received.size !== expected.size) {
    throw new Error('[ai-i18n/openai] invalid translation result');
  }
  return requests.map((request) => received.get(requestKey(request))!);
}

function safeProviderError(error: unknown): Error {
  if (isRecord(error) && typeof error.status === 'number') {
    return new Error(
      `[ai-i18n/openai] request failed with status ${error.status}`,
    );
  }
  return new Error('[ai-i18n/openai] translation request failed');
}

function requestKey(value: Pick<TranslationRequest, 'messageId' | 'locale'>) {
  return `${value.messageId}\u0000${value.locale}`;
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
