import type { ProviderRequest, ProviderResult } from './provider-types.js';
import type { PerformanceHandle } from './performance-recorder.js';

export interface PendingRequest {
  timing?: PerformanceHandle;
  key: string;
  request: ProviderRequest;
  state: RequestState;
  promise: Promise<readonly ProviderResult[]>;
  resolve: (results: readonly ProviderResult[]) => void;
  serializedLength: number;
}
export interface RequestState {
  latest: ProviderRequest;
  pending: Set<PendingRequest>;
  resolvedLocales: Set<string>;
  failed: boolean;
}
export function sameRequest(
  left: ProviderRequest,
  right: ProviderRequest,
): boolean {
  return (
    left.source === right.source &&
    left.comment === right.comment &&
    left.locales.length === right.locales.length &&
    left.locales.every((locale, index) => locale === right.locales[index])
  );
}

export function updateLatest(
  state: RequestState,
  request: ProviderRequest,
): void {
  if (
    state.latest.source !== request.source ||
    state.latest.comment !== request.comment
  ) {
    state.resolvedLocales.clear();
  }
  if (!sameRequest(state.latest, request)) state.failed = false;
  state.latest = request;
}
