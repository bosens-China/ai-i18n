import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { digest } from './scan-cache.js';
import { createServer } from 'node:http';
import type { ViteDevServer } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { withFileLock } from '@ai-i18n/core/translation-memory';
import type { AiI18nPluginApi } from './plugin-api.js';
import { ensureScan, type ScanResult } from './scan-catalog.js';

const activeServers = new Map<string, ViteDevServer>();
const rootPath = (server: ViteDevServer) => realpathSync(server.config.root);
const configPath = (server: ViteDevServer) =>
  server.config.configFile && realpathSync(server.config.configFile);
const descriptor = (server: ViteDevServer) =>
  path.join(
    os.tmpdir(),
    'ai-i18n-dev',
    `${digest(rootPath(server) + '\0' + path.resolve(rootPath(server), path.relative(server.config.root, server.config.cacheDir)))}.json`,
  );

/** 只监听回环地址并验证随机令牌；Skill 将扫描交给已持有项目状态的 Dev。 */
export async function startScanBridge(
  server: ViteDevServer,
  api: AiI18nPluginApi,
) {
  return withFileLock(descriptor(server), async () => {
    const token = randomBytes(32).toString('hex');
    const filename = descriptor(server);
    const previous = await readDescriptor(filename);
    // Vite 先创建新 Server 再关闭旧 Server；仅允许正在重启的旧实例交接。
    const restarting = Boolean(
      (
        activeServers.get(filename) as
          (ViteDevServer & { _restartPromise?: Promise<void> }) | undefined
      )?._restartPromise,
    );
    if (
      previous &&
      alive(previous.pid) &&
      !(previous.pid === process.pid && restarting)
    )
      throw new Error(
        diagnosticMessage(
          '[ai-i18n] 此应用已有活动 Dev，请复用该进程或为另一个实例配置独立 cacheDir 和 i18n 目录。',
          '[ai-i18n] This app already has an active Dev server. Reuse it or give the other instance separate cacheDir and i18n directories.',
        ),
      );
    const bridge = createServer(async (request, response) => {
      response.setHeader('Content-Type', 'application/json');
      if (
        request.method !== 'POST' ||
        request.url !== '/scan' ||
        request.headers.authorization !== `Bearer ${token}` ||
        request.headers.origin
      ) {
        response.writeHead(403).end();
        return;
      }
      try {
        response.end(JSON.stringify(await ensureScan(server, api)));
      } catch (cause) {
        response.writeHead(500).end(JSON.stringify({ error: String(cause) }));
      }
    });
    await new Promise<void>((resolve, reject) => {
      bridge.once('error', reject);
      bridge.listen(0, '127.0.0.1', resolve);
    });
    bridge.unref();
    const address = bridge.address();
    if (!address || typeof address === 'string')
      throw new Error(
        diagnosticMessage(
          '[ai-i18n] 扫描协调服务未返回有效地址。',
          '[ai-i18n] Scan bridge did not return a valid address.',
        ),
      );
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(
      filename,
      JSON.stringify({
        pid: process.pid,
        port: address.port,
        token,
        mode: server.config.mode,
        root: rootPath(server),
        configFile: configPath(server),
      }),
      { mode: 0o600 },
    );
    activeServers.set(filename, server);
    return async () => {
      bridge.closeAllConnections();
      await new Promise<void>((resolve) => bridge.close(() => resolve()));
      if (activeServers.get(filename) === server)
        activeServers.delete(filename);
      if ((await readDescriptor(filename))?.token === token)
        await fs.rm(filename, { force: true });
    };
  });
}

export async function scanWithDev(
  server: ViteDevServer,
  entries?: readonly string[],
): Promise<ScanResult | undefined> {
  const current = await readDescriptor(descriptor(server));
  if (!current || !alive(current.pid)) return;
  if (
    entries ||
    current.mode !== server.config.mode ||
    current.root !== rootPath(server) ||
    current.configFile !== configPath(server)
  )
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 活动 Dev 的 mode/入口与本次扫描不兼容，请关闭 Dev 后执行自定义扫描。',
        '[ai-i18n] The active Dev mode/entries are incompatible with this scan. Stop Dev before a custom scan.',
      ),
    );
  const response = await fetch(`http://127.0.0.1:${current.port}/scan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${current.token}` },
    signal: AbortSignal.timeout(120_000),
  });
  const result = (await response.json()) as ScanResult & { error?: string };
  if (!response.ok)
    throw new Error(
      result.error ??
        diagnosticMessage(
          '[ai-i18n] Dev 扫描失败。',
          '[ai-i18n] Dev scan failed.',
        ),
    );
  return result;
}

async function readDescriptor(filename: string) {
  const value = await fs
    .readFile(filename, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => undefined);
  if (
    !value ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    !Number.isSafeInteger(value.port) ||
    value.port < 1 ||
    value.port > 65535 ||
    !/^[a-f0-9]{64}$/.test(value.token)
  )
    return;
  return value as {
    pid: number;
    port: number;
    token: string;
    mode: string;
    root: string;
    configFile: string | false;
  };
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
