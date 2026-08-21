import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const REVIEW_UI_PACKAGE = '@ai-i18n/review-ui';
const REVIEW_UI_WS_PATH = '/__vite_ws';

/**
 * 仓库开发时把私有 review-ui 作为独立 Vite 应用挂到业务 Dev Server。
 * 发布包旁不存在该 workspace，因此会自然回退到随包静态资源。
 */
export async function createReviewUiDevServer(
  parent: ViteDevServer,
): Promise<ViteDevServer | undefined> {
  if (process.env.AI_I18N_REVIEW_UI_DIR || !parent.httpServer) return undefined;

  const root = await findLocalReviewUiRoot();
  if (!root) return undefined;

  const child = await createServer({
    root,
    // 多个业务 Dev Server 会各自创建 review-ui 子服务，必须隔离依赖优化缓存，
    // 否则它们会并发提交同一个 node_modules/.vite/deps 目录。
    cacheDir: reviewUiCacheDirectory(
      parent.config.root,
      parent.config.cacheDir,
    ),
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'development',
    appType: 'custom',
    clearScreen: false,
    customLogger: parent.config.logger,
    server: {
      middlewareMode: { server: parent.httpServer },
      // 与业务应用共用端口，但使用独立路径避免两个 HMR 通道冲突。
      ws: { server: parent.httpServer, path: REVIEW_UI_WS_PATH },
    },
  });

  parent.httpServer.once('close', () => {
    void child.close();
  });
  return child;
}

export function reviewUiCacheDirectory(
  parentRoot: string,
  parentCacheDirectory: string,
): string {
  return path.join(
    path.resolve(parentRoot, parentCacheDirectory),
    'ai-i18n-review-ui',
  );
}

export async function findLocalReviewUiRoot(): Promise<string | undefined> {
  const root = path.normalize(
    fileURLToPath(new URL('../../review-ui/', import.meta.url)),
  );
  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(root, 'package.json'), 'utf8'),
    ) as { name?: unknown };
    return packageJson.name === REVIEW_UI_PACKAGE ? root : undefined;
  } catch (cause) {
    if (isMissing(cause)) return undefined;
    throw cause;
  }
}

function isMissing(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    'code' in cause &&
    (cause.code === 'ENOENT' || cause.code === 'ENOTDIR')
  );
}
