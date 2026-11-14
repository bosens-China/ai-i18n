import fs from 'node:fs/promises';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import type { RepositoryStore } from './repository-store.js';

export function serveRepositoryFiles(
  server: ViteDevServer,
  store: RepositoryStore,
): void {
  const base = server.config.base.endsWith('/')
    ? server.config.base
    : `${server.config.base}/`;
  const prefix = `${base}@ai-i18n/files/`;
  const directory = path.join(store.directory, 'locales', 'files');
  server.middlewares.use(async (request, response, next) => {
    const url = request.url?.split('?')[0];
    if (!url?.startsWith(prefix)) return next();
    let relative: string;
    try {
      relative = decodeURIComponent(url.slice(prefix.length));
    } catch {
      response.statusCode = 400;
      return response.end();
    }
    if (
      relative !== 'manifest.json' &&
      !/^[a-zA-Z0-9%.-]+\/[a-zA-Z0-9_-]+\.json$/u.test(relative)
    ) {
      response.statusCode = 400;
      return response.end();
    }
    const file = path.resolve(directory, relative);
    if (!file.startsWith(`${directory}${path.sep}`)) {
      response.statusCode = 400;
      return response.end();
    }
    try {
      const content = await fs.readFile(file);
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache');
      response.end(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        response.statusCode = 404;
        response.end();
      } else next(error);
    }
  });
}
