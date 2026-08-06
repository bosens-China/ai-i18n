import type { TranslationMessage, TranslationValue } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import { z } from 'zod';

export interface TranslationPayload {
  translations: Array<Record<string, TranslationValue>>;
}

const DEFAULT_SYSTEM_PROMPT =
  '你是一名专业的软件界面翻译助手。请把用户输入翻译为指定目标语言，并结合随正文提供的 comment 理解业务语境。保持 HTML、Markdown、ICU 语法、快捷键和产品名称不变；无法可靠翻译时返回 null。';

function requiredString() {
  return z
    .string({ error: 'must be a string' })
    .trim()
    .min(1, { error: 'is required' });
}

function optionalString() {
  return z
    .string({ error: 'must be a string' })
    .transform((value) => value.trim() || undefined)
    .optional();
}
const nonNegativeNumber = z
  .number({ error: 'must be a number' })
  .nonnegative({ error: 'must be non-negative' });
const positiveInteger = z
  .number({ error: 'must be a number' })
  .int({ error: 'must be a positive integer' })
  .positive({ error: 'must be a positive integer' });
const nonNegativeInteger = z
  .number({ error: 'must be a number' })
  .int({ error: 'must be a non-negative integer' })
  .nonnegative({ error: 'must be a non-negative integer' });

const headersSchema = z
  .custom<HeadersInit>(
    (value) => {
      try {
        new Headers(value as HeadersInit);
        return true;
      } catch {
        return false;
      }
    },
    { error: 'must be valid HeadersInit' },
  )
  .transform<Record<string, string>>((value) => {
    try {
      const normalized: Record<string, string> = {};
      new Headers(value).forEach((headerValue, name) => {
        normalized[name] = headerValue;
      });
      return normalized;
    } catch {
      // 前置 custom 校验已确保该分支不可达，保留空对象满足转换函数的总返回类型。
      return {};
    }
  })
  .optional();

export const langSmithOptionsSchema = z.object({
  apiKey: requiredString(),
  project: optionalString(),
  endpoint: optionalString(),
  workspaceId: optionalString(),
});

export const openAIOptionsSchema = z.object({
  baseURL: requiredString().transform((value) => value.replace(/\/+$/, '')),
  model: requiredString(),
  apiKey: optionalString(),
  temperature: nonNegativeNumber.default(1),
  maxTokens: positiveInteger.optional(),
  timeoutMs: positiveInteger.default(120_000),
  maxRetries: nonNegativeInteger.default(3),
  headers: headersSchema,
  systemPrompt: requiredString().default(DEFAULT_SYSTEM_PROMPT),
  langSmith: langSmithOptionsSchema.optional(),
});

const localeSchema = z
  .string({ error: 'must be a string' })
  .refine((locale) => locale.trim().length > 0, 'must not be blank');
const targetLocalesSchema = z
  .array(localeSchema)
  .min(1)
  .refine((locales) => new Set(locales).size === locales.length);
const translationMessagesSchema = z.array(
  z
    .object({
      source: z.string(),
      comment: z.string().optional(),
    })
    .strict(),
);
const providerErrorSchema = z.object({ status: z.number() });

export type NormalizedOpenAIOptions = z.output<typeof openAIOptionsSchema>;

export function parseOpenAIOptions(value: unknown): NormalizedOpenAIOptions {
  const result = openAIOptionsSchema.safeParse(value);
  if (result.success) return result.data;
  const chinese = result.error.issues
    .map((issue) => `${formatPath(issue.path)}${chineseReason(issue.message)}`)
    .join('；');
  const english = result.error.issues
    .map((issue) => `${formatPath(issue.path)} ${issue.message}`)
    .join('; ');
  throw new TypeError(
    diagnosticMessage(
      `[ai-i18n/openai] 配置无效：${chinese}`,
      `[ai-i18n/openai] invalid configuration: ${english}`,
    ),
  );
}

export function parseTargetLocales(value: unknown): readonly string[] {
  const result = targetLocalesSchema.safeParse(value);
  if (result.success) return result.data;
  throw new TypeError(
    diagnosticMessage(
      '[ai-i18n/openai] 目标语言列表无效',
      '[ai-i18n/openai] invalid target locales',
    ),
  );
}

export function parseTranslationMessages(
  value: unknown,
): readonly TranslationMessage[] {
  const result = translationMessagesSchema.safeParse(value);
  if (result.success) return result.data;
  throw new TypeError(
    diagnosticMessage(
      '[ai-i18n/openai] 翻译消息列表无效',
      '[ai-i18n/openai] invalid translation messages',
    ),
  );
}

export function createTranslationPayloadSchema(
  locales: readonly string[],
  rowCount: number,
): z.ZodType<TranslationPayload> {
  const rowShape = Object.fromEntries(
    locales.map((locale) => [locale, z.string().nullable()]),
  );
  return z
    .object({
      translations: z.array(z.object(rowShape).strict()).length(rowCount),
    })
    .strict() as z.ZodType<TranslationPayload>;
}

export function readProviderStatus(value: unknown): number | undefined {
  const result = providerErrorSchema.safeParse(value);
  return result.success ? result.data.status : undefined;
}

function formatPath(path: PropertyKey[]): string {
  return path.map(String).join('.') || 'options';
}

function chineseReason(reason: string): string {
  const reasons: Record<string, string> = {
    'is required': '为必填项',
    'must be a string': '必须是字符串',
    'must be a number': '必须是数字',
    'must be non-negative': '必须大于或等于 0',
    'must be a positive integer': '必须是正整数',
    'must be a non-negative integer': '必须是非负整数',
    'must be valid HeadersInit': '必须是有效的 HeadersInit',
  };
  return reasons[reason] ?? '无效';
}
