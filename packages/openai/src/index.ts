import type {
  TranslationRequest,
  TranslationResult,
  Translator,
} from '@ai-i18n/core';

export interface OpenAIOptions {
  /** OpenAI-compatible API 根地址，例如 `https://example.com/v1`。 */
  baseURL: string;
  /** 模型名必须由使用者显式选择。 */
  model: string;
  /** 翻译业务 Prompt 必须由使用者提供。 */
  prompt: string;
  /** 可从调用方自己的环境变量传入；Provider 不主动读取环境。 */
  apiKey?: string;
  headers?: HeadersInit;
  fetch?: typeof globalThis.fetch;
}

interface TranslationPayload {
  translations: TranslationResult[];
}

const RESPONSE_SCHEMA = {
  name: 'ai_i18n_translations',
  strict: true,
  schema: {
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
  },
} as const;

export function openAI(options: OpenAIOptions): Translator {
  const baseURL = requiredOption(options.baseURL, 'baseURL').replace(/\/+$/, '');
  const model = requiredOption(options.model, 'model');
  const prompt = requiredOption(options.prompt, 'prompt');
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new Error('[ai-i18n/openai] fetch is unavailable');
  }

  return async (requests) => {
    if (requests.length === 0) return [];

    const response = await fetcher(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: createHeaders(options),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: JSON.stringify({ requests }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `[ai-i18n/openai] request failed with status ${response.status}`,
      );
    }

    const completion = await readJson(response, 'invalid JSON response');
    const content = parseCompletion(completion);
    const payload = parsePayload(content);
    return validateResults(requests, payload.translations);
  };
}

function createHeaders(options: OpenAIOptions): Headers {
  const headers = new Headers(options.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const apiKey = options.apiKey?.trim();
  if (apiKey && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }
  return headers;
}

async function readJson(response: Response, reason: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`[ai-i18n/openai] ${reason}`);
  }
}

function parseCompletion(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new Error('[ai-i18n/openai] invalid completion response');
  }
  const first = value.choices[0];
  if (
    !isRecord(first) ||
    !isRecord(first.message) ||
    typeof first.message.content !== 'string'
  ) {
    throw new Error('[ai-i18n/openai] invalid completion response');
  }
  return first.message.content;
}

function parsePayload(content: string): TranslationPayload {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('[ai-i18n/openai] invalid translation JSON');
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['translations']) ||
    !Array.isArray(value.translations)
  ) {
    throw new Error('[ai-i18n/openai] invalid translation payload');
  }
  return { translations: value.translations as TranslationResult[] };
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

function requestKey(value: Pick<TranslationRequest, 'messageId' | 'locale'>) {
  return `${value.messageId}\u0000${value.locale}`;
}

function requiredOption(value: string, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`[ai-i18n/openai] ${name} is required`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}
