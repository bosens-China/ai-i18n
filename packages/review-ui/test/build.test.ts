import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const output = path.resolve('packages/review-ui/dist');

describe('review UI build', () => {
  it('produces a stable Shadow DOM module with inline UnoCSS assets', async () => {
    const client = await fs.readFile(path.join(output, 'review-ui.js'));
    const files = await fs.readdir(output);
    const source = client.toString();
    expect(client.byteLength).toBeGreaterThan(10_000);
    expect(source).toContain('mountReviewWorkbench');
    expect(source).toContain('.review-root');
    expect(source).toMatch(/\.review-root\{[^}]*color-scheme:dark/);
    expect(source).not.toMatch(/:host\{[^}]*color-scheme:dark/);
    expect(files).not.toContain('review-ui.css');
    expect(files).not.toContain('index.html');
  });
});
