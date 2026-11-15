import type {
  ReviewMessageReference,
  ReviewSnapshot,
  ReviewSourceLocation,
} from '@ai-i18n/core';

export interface ReviewOverrideTarget {
  message: ReviewMessageReference;
  locale: string;
  file?: string;
  location?: ReviewSourceLocation;
}

export interface ReviewOverrideUpdate extends ReviewOverrideTarget {
  value: string;
}

export interface ReviewMutationResult {
  changed: boolean;
  affectedModuleCount: number;
}

export interface ReviewService {
  snapshot(full?: boolean): Promise<ReviewSnapshot>;
  setOverride(update: ReviewOverrideUpdate): Promise<ReviewMutationResult>;
  deleteOverride(target: ReviewOverrideTarget): Promise<ReviewMutationResult>;
}

export { ReviewProblem } from './review-problem.js';
