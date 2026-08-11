import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const output = path.resolve('packages/review-ui/dist');

describe('review UI build', () => {
  it('produces self-contained CSP-compatible static assets', async () => {
    const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    const clientPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    const stylePath = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];

    expect(html).toContain('<title>ai-i18n Review</title>');
    expect(html).not.toContain('/src/main.ts');
    expect(html).not.toMatch(/<script(?![^>]+src=)[^>]*>/);
    expect(html).not.toContain('<style');
    expect(clientPath).toMatch(/^\/__ai-i18n\/assets\//);
    expect(stylePath).toMatch(/^\/__ai-i18n\/assets\//);

    const client = await fs.readFile(resolveAsset(clientPath!));
    const style = await fs.readFile(resolveAsset(stylePath!));
    expect(client.byteLength).toBeGreaterThan(10_000);
    expect(style.byteLength).toBeGreaterThan(1_000);
  });
});

function resolveAsset(publicPath: string): string {
  return path.join(output, publicPath.replace('/__ai-i18n/', ''));
}
