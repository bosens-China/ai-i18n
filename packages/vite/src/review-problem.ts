export class ReviewProblem extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly zh: string,
    readonly en: string,
  ) {
    super(en);
  }
}
