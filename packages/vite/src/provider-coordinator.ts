import type { TranslationBatchEvent } from '@ai-i18n/core';
import { type TranslationLogging, type Translator } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import {
  createBatchId,
  localeKey,
  nonNegativeNumber,
  positiveInteger,
  promptMessage,
  readyLocalesKey,
  takeBatch,
  validateRequest,
  translateProviderBatch,
} from './provider-coordinator-helpers.js';
import {
  sameRequest,
  updateLatest,
  type PendingRequest,
  type RequestState,
} from './provider-request-state.js';
import { reportTranslationBatchEvent } from './provider-batch-tracing.js';
import type {
  PerformanceHandle,
  PerformanceRecorder,
} from './performance-recorder.js';
import type {
  ProviderRequest,
  ProviderResult,
  ProviderCoordinatorOptions,
  TranslationBatchEventDetails,
} from './provider-types.js';
export type {
  ProviderRequest,
  ProviderResult,
  ProviderCoordinatorOptions,
} from './provider-types.js';

export class ProviderCoordinator {
  private readonly performance?: PerformanceRecorder;
  private readonly debounceMs: number;
  private readonly batchLength: number;
  private readonly maxConcurrency: number;
  private readonly strict: boolean;
  private readonly logging: TranslationLogging;
  private readonly onResults?: ProviderCoordinatorOptions['onResults'];
  private readonly onWarning: (message: string) => void;
  private readonly active = new Map<string, PendingRequest>();
  private readonly states = new Map<string, RequestState>();
  private readonly queued = new Map<string, PendingRequest>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly errors: Error[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly translator: Translator,
    options: ProviderCoordinatorOptions = {},
  ) {
    this.performance = options.performance;
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
    this.logging = options.logging ?? false;
    this.onResults = options.onResults;
    this.onWarning = options.onWarning ?? console.warn;
  }

  request(request: ProviderRequest): Promise<readonly ProviderResult[]> {
    validateRequest(request);
    const normalized = { ...request, locales: [...request.locales] };
    const key = request.messageId;
    const state = this.states.get(key);
    const matching = [...(state?.pending ?? [])].find((pending) =>
      sameRequest(pending.request, normalized),
    );
    if (matching) {
      updateLatest(state!, normalized);
      return matching.promise;
    }
    const existing = this.active.get(key);
    if (existing && this.queued.get(key) === existing) {
      existing.request = normalized;
      updateLatest(existing.state, normalized);
      existing.serializedLength = JSON.stringify(
        promptMessage(normalized),
      ).length;
      this.dispatchReadyBatches();
      if (this.hasQueued()) this.schedule();
      else this.clearTimer();
      return existing.promise;
    }

    let resolve!: (results: readonly ProviderResult[]) => void;
    const promise = new Promise<readonly ProviderResult[]>((done) => {
      resolve = done;
    });
    const requestState = state ?? {
      latest: normalized,
      pending: new Set<PendingRequest>(),
      resolvedLocales: new Set<string>(),
      failed: false,
    };
    updateLatest(requestState, normalized);
    const pending: PendingRequest = {
      timing: this.performance?.start(
        'provider-queue-wait',
        this.performance.currentModule(),
      ),
      key,
      request: normalized,
      state: requestState,
      promise,
      resolve,
      serializedLength: JSON.stringify(promptMessage(normalized)).length,
    };
    requestState.pending.add(pending);
    this.states.set(key, requestState);
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

  reportBatchEvent(event: TranslationBatchEventDetails): void {
    reportTranslationBatchEvent(
      this.translator,
      { ...event, logging: this.logging } as TranslationBatchEvent,
      this.onWarning,
    );
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.dispatchAll();
    }, this.debounceMs);
  }

  private dispatchReadyBatches(): void {
    let localesKey: string | undefined;
    while (
      this.queued.size &&
      this.inFlight.size < this.maxConcurrency &&
      (localesKey = readyLocalesKey(this.queued.values(), this.batchLength)) !==
        undefined
    ) {
      this.dispatch(localesKey);
    }
  }

  private dispatchAll(): void {
    while (this.queued.size && this.inFlight.size < this.maxConcurrency) {
      this.dispatch(localeKey(this.queued.values().next().value!.request));
    }
  }

  private dispatch(localesKey: string): void {
    const batch = takeBatch(this.queued.values(), localesKey, this.batchLength);
    for (const pending of batch) this.queued.delete(pending.key);
    this.startBatch(batch);
  }

  private startBatch(batch: PendingRequest[]): void {
    const batchId = createBatchId();
    for (const pending of batch) pending.timing?.end('ok', { batchId });
    const handle = this.performance?.start(
      'provider-batch',
      '<provider>',
      {
        batchId,
        messageCount: batch.length,
        localeCount: batch[0]!.request.locales.length,
      },
      true,
    );
    const run = () => this.runBatch(batch, batchId, handle);
    const task = (handle ? handle.run(run) : run()).finally(() => {
      handle?.end();
      this.inFlight.delete(task);
      for (const pending of batch) {
        if (this.active.get(pending.key) === pending)
          this.active.delete(pending.key);
        pending.state.pending.delete(pending);
        if (
          pending.state.pending.size === 0 &&
          this.states.get(pending.key) === pending.state
        ) {
          this.states.delete(pending.key);
          const missing = pending.state.latest.locales.filter(
            (locale) => !pending.state.resolvedLocales.has(locale),
          ).length;
          if (missing && !pending.state.failed) {
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
        }
      }
      this.dispatchReadyBatches();
      if (this.hasQueued()) this.schedule();
      else this.clearTimer();
    });
    this.inFlight.add(task);
  }

  private async runBatch(
    batch: PendingRequest[],
    batchId: string,
    handle?: PerformanceHandle,
  ): Promise<void> {
    const locales = batch[0]!.request.locales;
    this.reportBatchEvent({
      batchId,
      stage: 'scheduled',
      locales,
      messageCount: batch.length,
    });
    try {
      const messages = batch.map((pending) => promptMessage(pending.request));
      const rows = await translateProviderBatch(
        this.translator,
        {
          batchId,
          logging: this.logging,
          locales,
          messages,
        },
        this.performance,
      );
      const results = batch.map((pending, index) =>
        locales.map((locale) => ({
          messageId: pending.request.messageId,
          locale,
          value: rows[index]![locale]!,
        })),
      );
      // 同一消息在 Provider 返回前可能产生新请求，只保留上下文未变且仍缺失的语言。
      const currentResults = results.flatMap((row, index) => {
        const pending = batch[index]!;
        const latest = pending.state.latest;
        if (
          latest.source !== pending.request.source ||
          latest.comment !== pending.request.comment
        ) {
          return [];
        }
        if (sameRequest(latest, pending.request)) return row;
        return row.filter(
          (result) =>
            result.value !== null && latest.locales.includes(result.locale),
        );
      });
      if (currentResults.length) {
        const apply = () => this.onResults?.(currentResults, { batchId });
        if (this.performance)
          await this.performance.measure(
            'provider-results',
            '<provider>',
            apply,
            { batchId },
          );
        else await apply();
        for (const [index, pending] of batch.entries()) {
          const latest = pending.state.latest;
          if (
            latest.source !== pending.request.source ||
            latest.comment !== pending.request.comment
          ) {
            continue;
          }
          for (const result of results[index]!) {
            if (
              result.value !== null &&
              latest.locales.includes(result.locale)
            ) {
              pending.state.resolvedLocales.add(result.locale);
            }
          }
        }
      }
      batch.forEach((pending, index) => pending.resolve(results[index]!));
    } catch (cause) {
      handle?.end('error');
      const hasCurrentRequest = batch.some((pending) =>
        sameRequest(pending.state.latest, pending.request),
      );
      const reason = cause instanceof Error ? cause.message : String(cause);
      const error = new Error(
        diagnosticMessage(
          '[ai-i18n] 翻译批次失败。',
          '[ai-i18n] Translator batch failed.',
        ),
        { cause },
      );
      this.reportBatchEvent({
        batchId,
        stage: 'failed',
        locales,
        messageCount: batch.length,
        reason,
      });
      if (hasCurrentRequest) {
        for (const pending of batch) {
          if (sameRequest(pending.state.latest, pending.request)) {
            pending.state.failed = true;
          }
        }
        if (this.strict) this.errors.push(error);
        this.onWarning(
          diagnosticMessage(
            `翻译批次失败；本批结果保持为空。原因：${reason}`,
            `Translator batch failed; this batch remains null. Cause: ${reason}`,
          ),
        );
      }
      for (const pending of batch) {
        pending.resolve(
          pending.request.locales.map((locale) => ({
            messageId: pending.request.messageId,
            locale,
            value: null,
          })),
        );
      }
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
