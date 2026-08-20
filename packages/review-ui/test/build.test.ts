import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const output = path.resolve('packages/review-ui/dist');

describe('review UI build', () => {
  it('produces stable Shadow DOM module and UnoCSS assets', async () => {
    const client = await fs.readFile(path.join(output, 'review-ui.js'));
    const style = await fs.readFile(path.join(output, 'review-ui.css'));
    expect(client.byteLength).toBeGreaterThan(10_000);
    expect(style.byteLength).toBeGreaterThan(1_000);
    expect(client.toString()).toContain('mountReviewWorkbench');
    expect(style.toString()).toContain('.review-root');
    expect(await fs.readdir(output)).not.toContain('index.html');
  });
});
