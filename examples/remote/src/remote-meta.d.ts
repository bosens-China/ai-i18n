import '@ai-i18n/vite/runtime';

declare module '@ai-i18n/vite/runtime' {
  interface Register {
    translationMeta: {
      version: string;
      service: 'Hono';
      mode: 'replace' | 'overlay';
    };
  }
}
