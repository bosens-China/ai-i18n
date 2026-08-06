import { inspect } from 'node:util';
import type { TranslationBatchEvent } from '@ai-i18n/core';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export function formatSDKLog(
  level: LogLevel,
  message: string,
  rest: readonly unknown[],
  secrets: readonly string[],
  batchId?: string,
): string | undefined {
  if (message.endsWith('sending request')) {
    return formatRequest(message, rest[0], secrets, batchId);
  }
  if (message.endsWith('response parsed')) {
    return formatResponse(message, rest[0], secrets, batchId);
  }
  if (
    level === 'DEBUG' &&
    (message.includes('response error') || message.includes('connection '))
  ) {
    return formatTransportError(message, rest[0], secrets, batchId);
  }
  // SDK 的 INFO success 与 response start 会被最终 RESPONSE 完整覆盖。
  if (level === 'INFO' || level === 'DEBUG') return undefined;
  return block(`SDK ${level}`, [message, ...rest], secrets, batchId);
}

export function formatProviderLog(
  level: 'INFO' | 'ERROR',
  message: string,
  details: unknown,
  secrets: readonly string[],
  batchId?: string,
): string {
  const title =
    message === 'translation batch validated'
      ? 'VALIDATION'
      : level === 'ERROR'
        ? 'ERROR'
        : 'PROVIDER';
  const values: unknown[] = [message];
  if (details !== undefined) values.push(details);
  return block(title, values, secrets, batchId);
}

export function formatBatchEvent(
  event: TranslationBatchEvent,
  secrets: readonly string[],
): string {
  const titles = {
    scheduled: 'BATCH SCHEDULED',
    'state-applied': 'STATE APPLIED',
    persisted: 'PERSISTED',
    failed: 'BATCH FAILED',
  } as const;
  const { batchId, stage, logging: _logging, ...details } = event;
  void _logging;
  return block(titles[stage], [details], secrets, batchId);
}

export function redactSecrets(
  value: string,
  secrets: readonly string[],
): string {
  let redacted = value;
  for (const secret of secrets) {
    const variants = [secret, inspect(secret), JSON.stringify(secret)].filter(
      (variant): variant is string => Boolean(variant),
    );
    for (const variant of variants) {
      redacted = redacted.split(variant).join('***');
    }
  }
  return redacted;
}

function formatRequest(
  message: string,
  value: unknown,
  secrets: readonly string[],
  batchId?: string,
): string {
  const details = asRecord(value);
  const options = asRecord(details?.options);
  const body = asRecord(options?.body);
  if (!details || !body)
    return block('REQUEST', [message, value], secrets, batchId);

  const lines = eventHeader('REQUEST', batchId);
  appendField(lines, 'requestId', requestId(message));
  appendField(lines, 'retryOf', details.retryOf);
  appendField(lines, 'method', details.method);
  appendField(lines, 'url', details.url);
  appendField(lines, 'model', body.model);

  const parameters = omitUndefined(body, ['model', 'messages']);
  if (Object.keys(parameters).length) {
    lines.push('', '[PARAMETERS]', formatValue(parameters, secrets));
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  lines.push('', '[MESSAGES]');
  if (!messages.length) lines.push('(none)');
  for (const input of messages) appendInputMessage(lines, input, secrets);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatResponse(
  message: string,
  value: unknown,
  secrets: readonly string[],
  batchId?: string,
): string {
  const details = asRecord(value);
  const body = asRecord(details?.body);
  if (!details || !body)
    return block('RESPONSE', [message, value], secrets, batchId);

  const lines = eventHeader('RESPONSE', batchId);
  appendField(lines, 'requestId', requestId(message));
  appendField(lines, 'retryOf', details.retryOf);
  appendField(lines, 'status', details.status);
  appendField(lines, 'durationMs', details.durationMs);

  const metadata = omitUndefined(body, ['choices', 'usage']);
  if (Object.keys(metadata).length) {
    lines.push('', '[RESPONSE METADATA]', formatValue(metadata, secrets));
  }

  if (Array.isArray(body.choices)) {
    for (const [index, input] of body.choices.entries()) {
      appendChoice(lines, input, index, secrets);
    }
  } else {
    lines.push('', '[BODY]', formatValue(body, secrets));
  }

  if (body.usage !== undefined) {
    lines.push('', '[USAGE]', formatValue(body.usage, secrets));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatTransportError(
  message: string,
  value: unknown,
  secrets: readonly string[],
  batchId?: string,
): string {
  const details = asRecord(value);
  const lines = eventHeader('TRANSPORT ERROR', batchId);
  appendField(lines, 'requestId', requestId(message));
  appendField(lines, 'retryOf', details?.retryOf);
  appendField(lines, 'status', details?.status);
  appendField(lines, 'durationMs', details?.durationMs);
  appendField(lines, 'url', details?.url);
  appendField(lines, 'event', stripRequestId(message));
  appendField(lines, 'message', details?.message);
  lines.push('');
  return redactSecrets(`${lines.join('\n')}\n`, secrets);
}

function appendInputMessage(
  lines: string[],
  value: unknown,
  secrets: readonly string[],
) {
  const message = asRecord(value);
  if (!message) {
    lines.push('', '[MESSAGE]', formatValue(value, secrets));
    return;
  }
  const role = typeof message.role === 'string' ? message.role : 'message';
  lines.push('', `[${role.toUpperCase()}]`);
  if ('content' in message) lines.push(formatContent(message.content, secrets));
  const fields = omitUndefined(message, ['role', 'content']);
  if (Object.keys(fields).length) {
    lines.push('[MESSAGE FIELDS]', formatValue(fields, secrets));
  }
}

function appendChoice(
  lines: string[],
  value: unknown,
  fallbackIndex: number,
  secrets: readonly string[],
) {
  const choice = asRecord(value);
  if (!choice) {
    lines.push('', `[CHOICE ${fallbackIndex}]`, formatValue(value, secrets));
    return;
  }
  const index = choice.index ?? fallbackIndex;
  lines.push('', `[CHOICE ${String(index)}]`);
  appendField(lines, 'finishReason', choice.finish_reason);

  const message = asRecord(choice.message);
  if (message) {
    if ('reasoning_content' in message) {
      lines.push(
        '',
        '[REASONING]',
        formatContent(message.reasoning_content, secrets),
      );
    }
    lines.push('', `[${responseRole(message)}]`);
    if ('content' in message)
      lines.push(formatContent(message.content, secrets));
    const fields = omitUndefined(message, [
      'role',
      'content',
      'reasoning_content',
    ]);
    if (Object.keys(fields).length) {
      lines.push('[MESSAGE FIELDS]', formatValue(fields, secrets));
    }
  } else if ('message' in choice) {
    lines.push('', '[MESSAGE]', formatValue(choice.message, secrets));
  }

  const fields = omitUndefined(choice, ['index', 'finish_reason', 'message']);
  if (Object.keys(fields).length) {
    lines.push('', '[CHOICE FIELDS]', formatValue(fields, secrets));
  }
}

function responseRole(message: Record<string, unknown>): string {
  return typeof message.role === 'string'
    ? message.role.toUpperCase()
    : 'ASSISTANT';
}

function formatContent(value: unknown, secrets: readonly string[]): string {
  return typeof value === 'string'
    ? redactSecrets(value, secrets)
    : formatValue(value, secrets);
}

function block(
  title: string,
  values: readonly unknown[],
  secrets: readonly string[],
  batchId?: string,
): string {
  const lines = eventHeader(title, batchId);
  for (const value of values) lines.push(formatValue(value, secrets));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function eventHeader(title: string, batchId?: string): string[] {
  const lines = ['-'.repeat(80), `[${displayTimestamp(new Date())}] ${title}`];
  appendField(lines, 'batchId', batchId);
  return lines;
}

function formatValue(value: unknown, secrets: readonly string[]): string {
  const formatted =
    typeof value === 'string'
      ? value
      : inspect(value, {
          colors: false,
          compact: false,
          depth: null,
          maxArrayLength: null,
          maxStringLength: null,
          breakLength: 100,
        });
  return redactSecrets(formatted, secrets);
}

function appendField(lines: string[], name: string, value: unknown) {
  if (value !== undefined) lines.push(`${name}: ${String(value)}`);
}

function omitUndefined(
  value: Record<string, unknown>,
  excluded: readonly string[],
): Record<string, unknown> {
  const excludedKeys = new Set(excluded);
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) => !excludedKeys.has(key) && item !== undefined,
    ),
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requestId(message: string): string | undefined {
  return /^\[([^\]]+)]/.exec(message)?.[1];
}

function stripRequestId(message: string): string {
  return message.replace(/^\[[^\]]+]\s*/, '');
}

function displayTimestamp(value: Date): string {
  return `${value.getFullYear()}-${twoDigits(value.getMonth() + 1)}-${twoDigits(value.getDate())} ${twoDigits(value.getHours())}:${twoDigits(value.getMinutes())}:${twoDigits(value.getSeconds())}.${String(value.getMilliseconds()).padStart(3, '0')}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}
