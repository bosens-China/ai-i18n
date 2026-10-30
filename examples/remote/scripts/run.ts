import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { build, createServer, type ViteDevServer } from 'vite';
import { createDemoServer, type Scenario } from '../server/app.js';

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'build') throw new Error('Use dev or build');
const remoteMode = process.argv[3] ?? 'replace';
if (!['replace', 'overlay'].includes(remoteMode))
  throw new Error('Unknown remote mode');
process.env.AI_I18N_DEMO_MODE = remoteMode;
const scenario =
  process.env.AI_I18N_DEMO_SCENARIO ??
  (remoteMode === 'overlay' ? 'partial' : 'ready');
if (!['ready', 'pending', 'invalid', 'partial', 'withdrawn'].includes(scenario))
  throw new Error('Unknown demo scenario');
let vite: ViteDevServer | undefined;
const app = createDemoServer({
  scenario: scenario as Scenario,
  restart:
    mode === 'dev'
      ? async () => {
          await vite?.restart();
        }
      : undefined,
});
const server = serve({
  fetch: app.fetch,
  hostname: '127.0.0.1',
  port: mode === 'build' ? 0 : 51885,
});
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing server address');
process.env.AI_I18N_DEMO_ORIGIN = `http://127.0.0.1:${address.port}`;
const config = { root: fileURLToPath(new URL('../', import.meta.url)) };

async function close() {
  await vite?.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
try {
  if (mode === 'build') {
    await build(config);
    await close();
  } else {
    vite = await createServer(config);
    await vite.listen();
    vite.printUrls();
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        void close().catch(console.error);
      });
    }
  }
} catch (error) {
  await close();
  throw error;
}
