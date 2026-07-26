import {
  hasSameTemplateTokens,
  type TranslationRequest,
  type TranslationResult,
  type TranslationValue,
  type Translator,
} from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';

export interface ProviderCoordinatorOptions {
  debounceMs?: number;
  batchLength?: number;
  maxConcurrency?: number;
  strict?: boolean;
  onResults?: (results: readonly TranslationResult[]) => void | Promise<void>;
  onWarning?: (message: string) => void;
}

interface PendingRequest {
  key: string;
  request: TranslationRequest;
  promise: Promise<TranslationValue>;
  resolve: (value: TranslationValue) => void;
  serializedLength: number;
}

export class ProviderCoordinator {
  private readonly debounceMs: number;
  private readonly batchLength: number;
  private readonly maxConcurrency: number;
  private readonly strict: boolean;
  private readonly onResults?: ProviderCoordinatorOptions['onResults'];
  private readonly onWarning: (message: string) => void;
  private readonly active = new Map<string, PendingRequest>();
  private readonly queued = new Map<string, PendingRequest>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly errors: Error[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly translator: Translator,
    options: ProviderCoordinatorOptions = {},
  ) {
    this.debounceMs = nonNegativeNumber(
      options.debounceMs ?? 100,
      'debounceMs',
    );
    this.batchLength = positiveInteger(
      options.batchLength ?? 12_000,
      'batchLength',
    );
    this.maxConcurrency = positiveInteger(
      options.maxConcurrency ?? 5,
      'maxConcurrency',
    );
    this.strict = options.strict ?? false;
    this.onResults = options.onResults;
    this.onWarning = options.onWarning ?? console.warn;
  }

  request(request: TranslationRequest): Promise<TranslationValue> {
    const key = requestKey(request.messageId, request.locale);
    const existing = this.active.get(key);
    if (existing) return existing.promise;

    let resolve!: (value: TranslationValue) => void;
    const promise = new Promise<TranslationValue>((done) => {
      resolve = done;
    });
    const pending = {
      key,
      request,
      promise,
      resolve,
      serializedLength: JSON.stringify(request).length,
    };
    this.active.set(key, pending);

    this.queued.set(key, pending);

    this.dispatchReadyBatches();
    if (this.hasQueued()) this.schedule();
    else this.clearTimer();
    return promise;
  }

  async flush(): Promise<void> {
    this.clearTimer();
    while (this.hasQueued() || this.inFlight.size) {
      this.dispatchAll();
      await Promise.all([...this.inFlight]);
    }
    if (this.strict && this.errors.length) {
      const errors = this.errors.splice(0);
      throw new AggregateError(
        errors,
        diagnosticMessage(
          '[ai-i18n] 翻译失败。',
          '[ai-i18n] Translation failed.',
        ),
      );
    }
    this.errors.length = 0;
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.dispatchAll();
    }, this.debounceMs);
  }

  private dispatchReadyBatches(): void {
    while (
      this.queued.size &&
      this.inFlight.size < this.maxConcurrency &&
      batchPayloadLength(this.queued.values()) >= this.batchLength
    ) {
      this.dispatch();
    }
  }

  private dispatchAll(): void {
    while (this.queued.size && this.inFlight.size < this.maxConcurrency) {
      this.dispatch();
    }
  }

  private dispatch(): void {
    const batch = takeBatch(this.queued.values(), this.batchLength);
    for (const pending of batch) this.queued.delete(pending.key);
    this.startBatch(batch);
  }

  private startBatch(batch: PendingRequest[]): void {
    const task = this.runBatch(batch).finally(() => {
      this.inFlight.delete(task);
      for (const pending of batch) {
        if (this.active.get(pending.key) === pending)
          this.active.delete(pending.key);
      }
      this.dispatchReadyBatches();
      if (this.hasQueued()) this.schedule();
      else this.clearTimer();
    });
    this.inFlight.add(task);
  }

  private async runBatch(batch: PendingRequest[]): Promise<void> {
    try {
      const results = validateResults(
        batch.map((pending) => pending.request),
        await this.translator(batch.map((pending) => pending.request)),
      );
      await this.onResults?.(results);
      const missing = results.filter((result) => result.value === null).length;
      if (missing) {
        this.onWarning(
          diagnosticMessage(
            `仍有 ${missing} 条翻译为空。`,
            `${missing} translation result(s) remain null.`,
          ),
        );
        if (this.strict) {
          this.errors.push(
            new Error(
              diagnosticMessage(
                '[ai-i18n] 仍有翻译为空。',
                '[ai-i18n] Translation results remain null.',
              ),
            ),
          );
        }
      }
      for (let index = 0; index < batch.length; index += 1) {
        batch[index]!.resolve(results[index]!.value);
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      const error = new Error(
        diagnosticMessage(
          '[ai-i18n] 翻译批次失败。',
          '[ai-i18n] Translator batch failed.',
        ),
        { cause },
      );
      this.errors.push(error);
      this.onWarning(
        diagnosticMessage(
          `翻译批次失败；本批结果保持为空。原因：${reason}`,
          `Translator batch failed; this batch remains null. Cause: ${reason}`,
        ),
      );
      for (const pending of batch) pending.resolve(null);
    }
  }

  private hasQueued(): boolean {
    return this.queued.size > 0;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

const EMPTY_BATCH_LENGTH = JSON.stringify({ requests: [] }).length;

function batchPayloadLength(requests: Iterable<PendingRequest>): number {
  let length = EMPTY_BATCH_LENGTH;
  let count = 0;
  for (const request of requests) {
    length += request.serializedLength + (count > 0 ? 1 : 0);
    count += 1;
  }
  return length;
}

function takeBatch(
  requests: Iterable<PendingRequest>,
  limit: number,
): PendingRequest[] {
  const batch: PendingRequest[] = [];
  let length = EMPTY_BATCH_LENGTH;
  for (const request of requests) {
    const nextLength =
      length + request.serializedLength + (batch.length ? 1 : 0);
    if (batch.length && nextLength > limit) break;
    batch.push(request);
    length = nextLength;
    if (length >= limit) break;
  }
  return batch;
}

function validateResults(
  requests: readonly TranslationRequest[],
  results: readonly TranslationResult[],
): TranslationResult[] {
  // 返回结果必须与请求一一对应，禁止额外、重复或缺失项污染缓存。
  if (!Array.isArray(results)) {
    throw new Error(
      diagnosticMessage(
        'Translator 必须返回结果数组。',
        'Translator must return an array of results.',
      ),
    );
  }
  const expected = new Map(
    requests.map((request) => [
      requestKey(request.messageId, request.locale),
      request,
    ]),
  );
  const received = new Map<string, TranslationResult>();
  for (const result of results) {
    if (
      !result ||
      typeof result.messageId !== 'string' ||
      typeof result.locale !== 'string' ||
      (typeof result.value !== 'string' && result.value !== null)
    ) {
      throw new Error(
        diagnosticMessage(
          'Translator 返回了无效的结果项。',
          'Translator returned an invalid result item.',
        ),
      );
    }
    const key = requestKey(result.messageId, result.locale);
    const request = expected.get(key);
    if (
      !request ||
      received.has(key) ||
      (result.value !== null &&
        !hasSameTemplateTokens(request.source, result.value))
    ) {
      throw new Error(
        diagnosticMessage(
          'Translator 返回了额外、重复或占位符不匹配的结果。',
          'Translator returned an extra, duplicate, or placeholder-mismatched result.',
        ),
      );
    }
    received.set(key, result);
  }
  if (received.size !== expected.size) {
    throw new Error(
      diagnosticMessage(
        'Translator 返回的结果不完整。',
        'Translator returned incomplete results.',
      ),
    );
  }
  return requests.map((request) =>
    received.get(requestKey(request.messageId, request.locale))!,
  );
}

function requestKey(messageId: string, locale: string): string {
  return JSON.stringify([messageId, locale]);
}

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      diagnosticMessage(
        `[ai-i18n] ${name} 必须是非负数。`,
        `[ai-i18n] ${name} must be a non-negative number.`,
      ),
    );
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(
      diagnosticMessage(
        `[ai-i18n] ${name} 必须是正整数。`,
        `[ai-i18n] ${name} must be a positive integer.`,
      ),
    );
  }
  return value;
}
