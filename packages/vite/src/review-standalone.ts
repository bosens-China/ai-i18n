import type { ViteDevServer } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import colors from 'picocolors';
import {
  REVIEW_BASE_PATH,
  REVIEW_PAGE_ICON_PATH,
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
      <link rel="icon" type="image/svg+xml" href="${REVIEW_PAGE_ICON_PATH}" />
      <link rel="stylesheet" href="${REVIEW_PAGE_STYLE_PATH}" />
  </head>
  <body>
    <div id="ai-i18n-review"></div>
    <script type="module" src="${REVIEW_PAGE_MODULE_PATH}"></script>
  </body>
</html>`;

const style = `html,body,#ai-i18n-review{width:100%;height:100%;margin:0;overflow:hidden}body{background:#0f172a}@media(prefers-color-scheme:light){body{background:#f8fafc}}`;

// 独立页不应借用业务项目的 favicon，避免不同项目中品牌表现不一致。
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="review-icon-ink" x1="8" y1="8" x2="32" y2="31" gradientUnits="userSpaceOnUse"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><path d="M8.5 7.5h19a5.5 5.5 0 0 1 5.5 5.5v9.5a5.5 5.5 0 0 1-5.5 5.5H18l-7 5v-5H8.5A4.5 4.5 0 0 1 4 23.5V12a4.5 4.5 0 0 1 4.5-4.5Z" fill="url(#review-icon-ink)"/><path d="M11.5 14.5h13M11.5 19h8" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="2.25"/><circle cx="29" cy="27.5" r="6.25" fill="#0f172a" stroke="#fff" stroke-width="1.5"/><path d="m26.2 27.5 1.8 1.8 3.8-4.2" fill="none" stroke="#5eead4" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>`;

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
  if (pathname === REVIEW_PAGE_ICON_PATH) {
    return {
      body: icon,
      contentType: 'image/svg+xml; charset=utf-8',
      html: false,
    };
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
    // Vite CLI 会在 listen() 返回后同步打印地址和快捷键，延后一轮可保持提示位于其下方。
    setTimeout(() => {
      const address =
        server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0];
      if (!address) return;
      const url = new URL(REVIEW_BASE_PATH, address).href;
      const label = diagnosticMessage('ai-i18n 翻译校对：', 'ai-i18n Review:');
      server.config.logger.info(
        `  ${colors.green('➜')}  ${colors.bold(label)} ${colors.cyan(url)}`,
      );
    }, 0);
  });
}
