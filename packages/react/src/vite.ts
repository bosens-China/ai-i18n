import type { SourceExtractor } from '@ai-i18n/vite';

export interface ReactExtractor extends SourceExtractor {
  readonly kind: 'react';
}

export function react(): ReactExtractor {
  return {
    kind: 'react',
    test: (id) => /\.[jt]sx$/.test(id),
    extract: (code) => ({
      analysisCode: code,
      mapLocation: (location) => location,
      translationHooks: [
        { module: '@ai-i18n/react', hook: 'useI18n', property: 't' },
      ],
    }),
  };
}
