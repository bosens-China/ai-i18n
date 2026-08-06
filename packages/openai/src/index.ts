import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { ChatOpenAI } from '@langchain/openai';
import { Client } from 'langsmith';
import type {
  TranslationBatch,
  TranslationMessage,
  TranslationResult,
  TranslationValue,
  Translator,
} from '@ai-i18n/core';
import { hasSameTemplateTokens } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import { createOpenAILogSession } from './logging';
import {
  createTranslationPayloadSchema,
  parseOpenAIOptions,
  parseTargetLocales,
  parseTranslationMessages,
  readProviderStatus,
  type TranslationPayload,
} from './schema';

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

const TEMPLATE_PLACEHOLDER_RULE =
  '`{{0}}`、`{{1}}` 等不带等号的编号标记代表运行时插值，可以按目标语言语序调整位置；`{{=0}}`、`{{==0}}` 等带等号的编号标记代表转义后的字面文本。两类标记都必须原样保留且出现相同次数，不能互换。';

export function openAI(options: OpenAIOptions): Translator {
  const normalized = parseOpenAIOptions(options);
  const {
    baseURL,
    model: modelName,
    systemPrompt: basePrompt,
    temperature,
    timeoutMs: timeout,
    maxRetries,
    maxTokens,
    headers,
    langSmith,
  } = normalized;
  // 显式占位值可阻止 LangChain 把宿主 OPENAI_API_KEY 泄露给本地服务。
  const apiKey = normalized.apiKey || 'local-no-auth';
  const callbacks = createLangSmithCallbacks(langSmith);
  const logSession = createOpenAILogSession({
    baseURL,
    model: modelName,
    apiKey,
  });

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
      logger: logSession.logger,
      logLevel: 'debug' as const,
      ...(headers ? { defaultHeaders: headers } : {}),
    },
  });

  async function translate({ locales, messages }: TranslationBatch) {
    const parsedLocales = parseTargetLocales(locales);
    const parsedMessages = parseTranslationMessages(messages);
    if (parsedMessages.length === 0) return [];
    const systemPrompt = `${basePrompt}\n\n${TEMPLATE_PLACEHOLDER_RULE}\n\n${outputInstructions(parsedLocales, parsedMessages.length)}`;
    const model = chatModel.withStructuredOutput<TranslationPayload>(
      createTranslationPayloadSchema(parsedLocales, parsedMessages.length),
      {
        name: 'ai_i18n_translations',
        method: 'jsonMode',
        includeRaw: true,
      },
    );

    const startedAt = Date.now();
    let payload: TranslationPayload | null;
    try {
      const response = await model.invoke([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify(parsedMessages),
        },
      ]);
      payload = response.parsed;
    } catch (error) {
      logSession.error('translation request failed', error);
      throw safeProviderError(error);
    }
    try {
      if (payload === null) throw invalidTranslationResultError();
      const results = validateTemplateTokens(
        parsedMessages,
        parsedLocales,
        payload.translations,
      );
      logSession.info('translation batch validated', {
        locales: parsedLocales,
        messages: parsedMessages.length,
        translations: results.length * parsedLocales.length,
        durationMs: Date.now() - startedAt,
      });
      return results;
    } catch (error) {
      logSession.error('translation result validation failed', error);
      throw error;
    }
  }

  let directBatchSequence = 0;
  const translator: Translator = ({ batchId, logging, locales, messages }) => {
    const resolvedBatchId =
      batchId?.trim() ||
      `openai_${Date.now().toString(36)}_${(++directBatchSequence).toString(36)}`;
    return logSession.run(resolvedBatchId, logging, () =>
      translate({ batchId: resolvedBatchId, locales, messages }),
    );
  };
  translator.reportBatchEvent = (event) => logSession.event(event);
  return translator;
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

function createLangSmithCallbacks(
  options: ReturnType<typeof parseOpenAIOptions>['langSmith'],
) {
  if (!options) return undefined;
  const client = new Client({
    apiKey: options.apiKey,
    ...(options.endpoint ? { apiUrl: options.endpoint } : {}),
    ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
  });
  return [
    new LangChainTracer({
      client,
      ...(options.project ? { projectName: options.project } : {}),
    }),
  ];
}

function validateTemplateTokens(
  messages: readonly TranslationMessage[],
  locales: readonly string[],
  results: readonly Record<string, TranslationValue>[],
): TranslationResult[] {
  const translated: TranslationResult[] = [];
  for (const [index, result] of results.entries()) {
    for (const locale of locales) {
      const value = result[locale];
      if (
        value !== null &&
        !hasSameTemplateTokens(messages[index]!.source, value)
      ) {
        throw new Error(
          diagnosticMessage(
            '[ai-i18n/openai] 翻译结果改变了模板占位符',
            '[ai-i18n/openai] translation result changed template placeholders',
          ),
        );
      }
    }
    translated.push(result);
  }
  return translated;
}

function safeProviderError(error: unknown): Error {
  const status = readProviderStatus(error);
  if (status !== undefined) {
    return new Error(
      diagnosticMessage(
        `[ai-i18n/openai] 请求失败，状态码为 ${status}`,
        `[ai-i18n/openai] request failed with status ${status}`,
      ),
    );
  }
  return new Error(
    diagnosticMessage(
      '[ai-i18n/openai] 翻译请求失败',
      '[ai-i18n/openai] translation request failed',
    ),
  );
}

function invalidTranslationResultError(): Error {
  return new Error(
    diagnosticMessage(
      '[ai-i18n/openai] 翻译结果无效',
      '[ai-i18n/openai] invalid translation result',
    ),
  );
}
