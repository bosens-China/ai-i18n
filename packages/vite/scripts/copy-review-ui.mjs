import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const source = path.resolve(packageRoot, '../review-ui/dist');
const target = path.resolve(packageRoot, 'dist/review-ui');

await fs.access(path.join(source, 'index.html'));
await fs.rm(target, { recursive: true, force: true });
await fs.cp(source, target, { recursive: true });
