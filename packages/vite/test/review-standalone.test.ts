import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { ViteDevServer } from 'vite';

vi.mock('picocolors', () => ({
  default: {
    green: (value: string) => `<green>${value}</green>`,
    bold: (value: string) => `<bold>${value}</bold>`,
    cyan: (value: string) => `<cyan>${value}</cyan>`,
  },
}));

import { printReviewUrl } from '../src/review-standalone';

describe('review standalone terminal hint', () => {
  it('prints after Vite startup output with terminal styling', async () => {
    vi.useFakeTimers();
    try {
      const httpServer = new EventEmitter();
      const info = vi.fn();
      const server = {
        httpServer,
        resolvedUrls: { local: ['http://localhost:51881/'], network: [] },
        config: { logger: { info } },
      } as unknown as ViteDevServer;

      printReviewUrl(server);
      httpServer.emit('listening');
      expect(info).not.toHaveBeenCalled();

      await vi.runAllTimersAsync();
      const message = String(info.mock.calls[0]?.[0]);
      expect(message).toMatch(
        /^(?: {2})<green>➜<\/green>(?: {2})<bold>.+<\/bold> /,
      );
      expect(message).toContain(
        '<cyan>http://localhost:51881/__ai-i18n/</cyan>',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
