export interface ReviewProblemShape {
  code: string;
  status: number;
  zh: string;
  en: string;
}

export class ReviewProblem extends Error implements ReviewProblemShape {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly zh: string,
    readonly en: string,
  ) {
    super(en);
  }
}
