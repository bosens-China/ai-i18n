import type {
  TranslationRequest,
  TranslationResult,
  TranslationValue,
  Translator,
} from '@ai-i18n/core';

export interface ProviderCoordinatorOptions {
  debounceMs?: number;
  batchSize?: number;
  strict?: boolean;
  onResults?: (results: readonly TranslationResult[]) => void | Promise<void>;
  onWarning?: (message: string) => void;
}

interface PendingRequest {
  key: string;
  request: TranslationRequest;
  promise: Promise<TranslationValue>;
  resolve: (value: TranslationValue) => void;
}

export class ProviderCoordinator {
  private readonly debounceMs: number;
  private readonly batchSize: number;
  private readonly strict: boolean;
  private readonly onResults?: ProviderCoordinatorOptions['onResults'];
  private readonly onWarning: (message: string) => void;
  private readonly active = new Map<string, PendingRequest>();
  private readonly queued = new Map<string, Map<string, PendingRequest>>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly errors: Error[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly translator: Translator,
    options: ProviderCoordinatorOptions = {},
  ) {
    this.debounceMs = nonNegativeNumber(options.debounceMs ?? 100, 'debounceMs');
    this.batchSize = positiveInteger(options.batchSize ?? 50, 'batchSize');
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
    const pending = { key, request, promise, resolve };
    this.active.set(key, pending);

    // Provider 按目标语言分批，避免一个批次混入多个目标语言。
    const localeQueue = this.queued.get(request.locale) ?? new Map();
    localeQueue.set(key, pending);
    this.queued.set(request.locale, localeQueue);

    if (localeQueue.size >= this.batchSize) {
      this.dispatchFullBatches(request.locale);
    }
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
      throw new AggregateError(errors, '[ai-i18n] translation failed');
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

  private dispatchFullBatches(locale: string): void {
    const queue = this.queued.get(locale);
    while (queue && queue.size >= this.batchSize) {
      this.dispatch(locale, this.batchSize);
    }
  }

  private dispatchAll(): void {
    for (const locale of [...this.queued.keys()]) {
      while (this.queued.has(locale)) this.dispatch(locale, this.batchSize);
    }
  }

  private dispatch(locale: string, limit: number): void {
    const queue = this.queued.get(locale);
    if (!queue?.size) return;
    const batch = [...queue.values()].slice(0, limit);
    for (const pending of batch) queue.delete(pending.key);
    if (!queue.size) this.queued.delete(locale);
    this.startBatch(batch);
  }

  private startBatch(batch: PendingRequest[]): void {
    const task = this.runBatch(batch).finally(() => {
      this.inFlight.delete(task);
      for (const pending of batch) {
        if (this.active.get(pending.key) === pending) this.active.delete(pending.key);
      }
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
        this.onWarning(`${missing} translation(s) remain null.`);
        if (this.strict) {
          this.errors.push(new Error('[ai-i18n] translations remain null'));
        }
      }
      for (let index = 0; index < batch.length; index += 1) {
        batch[index]!.resolve(results[index]!.value);
      }
    } catch {
      const error = new Error('[ai-i18n] translator batch failed');
      this.errors.push(error);
      this.onWarning('Translator batch failed; translations remain null.');
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

function validateResults(
  requests: readonly TranslationRequest[],
  results: readonly TranslationResult[],
): TranslationResult[] {
  // 返回结果必须与请求一一对应，禁止额外、重复或缺失项污染缓存。
  if (!Array.isArray(results)) throw new Error('invalid translator result');
  const expected = new Map(
    requests.map((request) => [requestKey(request.messageId, request.locale), request]),
  );
  const received = new Map<string, TranslationResult>();
  for (const result of results) {
    if (
      !result ||
      typeof result.messageId !== 'string' ||
      typeof result.locale !== 'string' ||
      (typeof result.value !== 'string' && result.value !== null)
    ) {
      throw new Error('invalid translator result');
    }
    const key = requestKey(result.messageId, result.locale);
    if (!expected.has(key) || received.has(key)) {
      throw new Error('invalid translator result');
    }
    received.set(key, result);
  }
  if (received.size !== expected.size) throw new Error('invalid translator result');
  return requests.map((request) => received.get(requestKey(request.messageId, request.locale))!);
}

function requestKey(messageId: string, locale: string): string {
  return JSON.stringify([messageId, locale]);
}

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`[ai-i18n] ${name} must be a non-negative number`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`[ai-i18n] ${name} must be a positive integer`);
  }
  return value;
}
