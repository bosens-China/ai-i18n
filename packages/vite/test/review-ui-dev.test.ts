import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewUiCacheDirectory } from '../src/review-ui-dev';

describe('review UI dev server', () => {
  it('isolates dependency optimizer caches by parent Vite project', () => {
    const repository = path.resolve('/workspace/ai-i18n');
    const vanilla = reviewUiCacheDirectory(
      path.join(repository, 'examples/vanilla'),
      'node_modules/.vite',
    );
    const vue = reviewUiCacheDirectory(
      path.join(repository, 'examples/vue'),
      'node_modules/.vite',
    );

    expect(vanilla).toBe(
      path.join(
        repository,
        'examples/vanilla/node_modules/.vite/ai-i18n-review-ui',
      ),
    );
    expect(vue).not.toBe(vanilla);
  });

  it('keeps an absolute parent cache directory absolute', () => {
    const cache = path.resolve('/tmp/custom-vite-cache');
    expect(reviewUiCacheDirectory('/workspace/app', cache)).toBe(
      path.join(cache, 'ai-i18n-review-ui'),
    );
  });
});
