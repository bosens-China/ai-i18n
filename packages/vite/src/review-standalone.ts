import type { ViteDevServer } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import {
  REVIEW_BASE_PATH,
  REVIEW_PAGE_MODULE_PATH,
  REVIEW_PAGE_STYLE_PATH,
  REVIEW_WORKBENCH_MODULE_PATH,
} from './review-page.js';

export interface ReviewStandaloneAsset {
  body: string;
  contentType: string;
  html: boolean;
}

const page = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ai-i18n Review</title>
    <link rel="stylesheet" href="${REVIEW_PAGE_STYLE_PATH}" />
  </head>
  <body>
    <div id="ai-i18n-review"></div>
    <script type="module" src="${REVIEW_PAGE_MODULE_PATH}"></script>
  </body>
</html>`;

const style = `html,body,#ai-i18n-review{width:100%;height:100%;margin:0;overflow:hidden}body{background:#0f172a}@media(prefers-color-scheme:light){body{background:#f8fafc}}`;

const module = [
  `import { mountReviewWorkbench } from ${JSON.stringify(REVIEW_WORKBENCH_MODULE_PATH)};`,
  `const container = document.getElementById('ai-i18n-review');`,
  `if (container) mountReviewWorkbench(container, { mode: 'standalone' });`,
].join('\n');

export function readReviewStandaloneAsset(
  pathname: string,
): ReviewStandaloneAsset | undefined {
  if (pathname === REVIEW_BASE_PATH) {
    return { body: page, contentType: 'text/html; charset=utf-8', html: true };
  }
  if (pathname === REVIEW_PAGE_STYLE_PATH) {
    return { body: style, contentType: 'text/css; charset=utf-8', html: true };
  }
  if (pathname === REVIEW_PAGE_MODULE_PATH) {
    return {
      body: module,
      contentType: 'text/javascript; charset=utf-8',
      html: false,
    };
  }
}

export function printReviewUrl(server: ViteDevServer): void {
  server.httpServer?.once('listening', () => {
    const address =
      server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0];
    if (!address) return;
    const url = new URL(REVIEW_BASE_PATH, address).href;
    server.config.logger.info(
      diagnosticMessage(
        `[ai-i18n] 翻译校对：${url}`,
        `[ai-i18n] Review: ${url}`,
      ),
    );
  });
}
