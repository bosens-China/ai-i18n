import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TranslationBatchEvent, TranslationLogging } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import {
  formatBatchEvent,
  formatProviderLog,
  formatSDKLog,
  redactSecrets,
} from './log-format';

interface OpenAILogContext {
  baseURL: string;
  model: string;
  apiKey?: string;
}

interface SDKLogger {
  debug(message: string, ...rest: unknown[]): void;
  info(message: string, ...rest: unknown[]): void;
  warn(message: string, ...rest: unknown[]): void;
  error(message: string, ...rest: unknown[]): void;
}

export interface OpenAILogSession {
  logger: SDKLogger;
  run<T>(
    batchId: string,
    logging: TranslationLogging | undefined,
    operation: () => Promise<T>,
  ): Promise<T>;
  event(event: TranslationBatchEvent): void;
  info(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

interface BatchContext {
  batchId: string;
  directory: string;
}

interface LogWriter {
  append(content: string | undefined): void;
}

let sessionSequence = 0;

export function createOpenAILogSession(
  context: OpenAILogContext,
): OpenAILogSession {
  const batchContext = new AsyncLocalStorage<BatchContext>();
  const writers = new Map<string, LogWriter>();
  const secrets = context.apiKey ? [context.apiKey] : [];
  let formatWarned = false;

  const writerFor = (directory: string) => {
    const normalizedDirectory = resolve(directory);
    let writer = writers.get(normalizedDirectory);
    if (!writer) {
      writer = createLogWriter(normalizedDirectory, context, secrets);
      writers.set(normalizedDirectory, writer);
    }
    return writer;
  };
  const safelyAppend = (
    directory: string,
    format: () => string | undefined,
  ) => {
    try {
      const content = format();
      if (content !== undefined) writerFor(directory).append(content);
    } catch (error) {
      if (formatWarned) return;
      formatWarned = true;
      console.warn(
        diagnosticMessage(
          `[ai-i18n/openai] 无法整理 LLM 日志，翻译将继续：${errorMessage(error)}`,
          `[ai-i18n/openai] Unable to format the LLM log; translation will continue: ${errorMessage(error)}`,
        ),
      );
    }
  };
  const appendCurrent = (format: (batchId: string) => string | undefined) => {
    const current = batchContext.getStore();
    if (current) safelyAppend(current.directory, () => format(current.batchId));
  };
  const logger: SDKLogger = {
    debug: (message, ...rest) =>
      appendCurrent((batchId) =>
        formatSDKLog('DEBUG', message, rest, secrets, batchId),
      ),
    info: (message, ...rest) =>
      appendCurrent((batchId) =>
        formatSDKLog('INFO', message, rest, secrets, batchId),
      ),
    warn: (message, ...rest) =>
      appendCurrent((batchId) =>
        formatSDKLog('WARN', message, rest, secrets, batchId),
      ),
    error: (message, ...rest) =>
      appendCurrent((batchId) =>
        formatSDKLog('ERROR', message, rest, secrets, batchId),
      ),
  };

  return {
    logger,
    run(batchId, logging, operation) {
      if (typeof logging !== 'string' || !logging.trim()) return operation();
      return batchContext.run(
        { batchId, directory: logging.trim() },
        operation,
      );
    },
    event(event) {
      if (typeof event.logging !== 'string' || !event.logging.trim()) return;
      safelyAppend(event.logging.trim(), () =>
        formatBatchEvent(event, secrets),
      );
    },
    info(message, details) {
      appendCurrent((batchId) =>
        formatProviderLog('INFO', message, details, secrets, batchId),
      );
    },
    error(message, details) {
      appendCurrent((batchId) =>
        formatProviderLog('ERROR', message, details, secrets, batchId),
      );
    },
  };
}

function createLogWriter(
  directory: string,
  context: OpenAILogContext,
  secrets: readonly string[],
): LogWriter {
  const startedAt = new Date();
  const filePath = resolve(
    directory,
    `${fileTimestamp(startedAt)}-p${process.pid}-${++sessionSequence}.log`,
  );
  let initialized = false;
  let disabled = false;
  let warned = false;

  return {
    append(content) {
      if (disabled || content === undefined) return;
      try {
        if (!initialized) {
          mkdirSync(directory, { recursive: true });
          writeFileSync(filePath, sessionHeader(startedAt, context, secrets), {
            encoding: 'utf8',
            flag: 'wx',
          });
          initialized = true;
        }
        appendFileSync(filePath, content, 'utf8');
      } catch (error) {
        disabled = true;
        if (warned) return;
        warned = true;
        console.warn(
          diagnosticMessage(
            `[ai-i18n/openai] 无法写入 LLM 日志，翻译将继续：${errorMessage(error)}`,
            `[ai-i18n/openai] Unable to write the LLM log; translation will continue: ${errorMessage(error)}`,
          ),
        );
      }
    },
  };
}

function sessionHeader(
  startedAt: Date,
  context: OpenAILogContext,
  secrets: readonly string[],
): string {
  return redactSecrets(
    [
      '='.repeat(80),
      `[${displayTimestamp(startedAt)}] [INFO] ai-i18n OpenAI log session started`,
      `model: ${context.model}`,
      `baseURL: ${context.baseURL}`,
      `pid: ${process.pid}`,
      '',
    ].join('\n'),
    secrets,
  );
}

function fileTimestamp(value: Date): string {
  return [
    value.getFullYear(),
    '-',
    twoDigits(value.getMonth() + 1),
    '-',
    twoDigits(value.getDate()),
    '_',
    twoDigits(value.getHours()),
    '-',
    twoDigits(value.getMinutes()),
    '-',
    twoDigits(value.getSeconds()),
    '-',
    String(value.getMilliseconds()).padStart(3, '0'),
  ].join('');
}

function displayTimestamp(value: Date): string {
  return `${value.getFullYear()}-${twoDigits(value.getMonth() + 1)}-${twoDigits(value.getDate())} ${twoDigits(value.getHours())}:${twoDigits(value.getMinutes())}:${twoDigits(value.getSeconds())}.${String(value.getMilliseconds()).padStart(3, '0')}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
