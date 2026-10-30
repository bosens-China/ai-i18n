import { Hono } from 'hono';
import { catalog, saveKey } from './catalog.js';

export type Scenario =
  'ready' | 'pending' | 'invalid' | 'partial' | 'withdrawn';

export function createDemoServer(
  options: { scenario?: Scenario; restart?: () => Promise<void> } = {},
) {
  const app = new Hono();
  const keys = new Set<string>();
  let revision = 1;
  let scenario: Scenario = options.scenario ?? 'ready';
  let publishes = 0;
  let loads = 0;
  const version = () => `demo-${revision}`;

  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method !== 'GET') {
      const origin = c.req.header('origin');
      if (
        origin &&
        !['http://localhost:51884', 'http://127.0.0.1:51884'].includes(origin)
      ) {
        return c.json({ error: 'invalid_origin' }, 403);
      }
      if (c.req.header('content-type')?.split(';')[0] !== 'application/json') {
        return c.json({ error: 'json_required' }, 415);
      }
    }
    await next();
  });
  app.onError(() =>
    Response.json({ error: 'invalid_request' }, { status: 400 }),
  );

  app.post('/api/sources', async (c) => {
    const input: unknown = await c.req.json();
    if (
      !input ||
      typeof input !== 'object' ||
      !('keys' in input) ||
      !Array.isArray(input.keys) ||
      input.keys.length > 500 ||
      !input.keys.every(
        (key) => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key),
      )
    ) {
      return c.json({ error: 'invalid_keys' }, 400);
    }
    for (const key of input.keys) keys.add(key);
    publishes += 1;
    return c.json({ accepted: input.keys.length, status: 'accepted' }, 202);
  });

  app.get('/api/locales/en.json', (c) => {
    loads += 1;
    const messages: Record<string, string> = {
      'another-project': 'Do not bundle this unrelated entry',
    };
    for (const key of keys) {
      if (
        scenario === 'withdrawn' ||
        (scenario === 'partial' && key !== saveKey)
      )
        continue;
      const entry = catalog.get(key);
      if (!entry || (key === saveKey && scenario === 'pending')) continue;
      messages[key] =
        key === saveKey && scenario === 'partial'
          ? 'Priority server copy'
          : key === saveKey && scenario === 'invalid'
            ? '{{999}}'
            : key === saveKey && revision > 1
              ? 'Changes saved'
              : entry.value;
    }
    return c.json({ version: version(), messages });
  });

  app.get('/api/status', (c) =>
    c.json({ version: version(), scenario, keys: [...keys], publishes, loads }),
  );
  app.post('/api/demo/scenario', async (c) => {
    const input: unknown = await c.req.json();
    if (
      !input ||
      typeof input !== 'object' ||
      !('scenario' in input) ||
      !['ready', 'pending', 'invalid', 'partial', 'withdrawn'].includes(
        String(input.scenario),
      )
    )
      return c.json({ error: 'invalid_scenario' }, 400);
    scenario = input.scenario as Scenario;
    revision += 1;
    return c.json({ version: version(), scenario });
  });
  app.post('/api/demo/restart', (c) => {
    if (!options.restart) return c.json({ error: 'dev_only' }, 409);
    // 先返回响应，再重启 Vite；Hono 状态保留，用于验证新旧快照的边界。
    setTimeout(() => {
      void options.restart?.().catch(console.error);
    }, 100);
    return c.json({ restarting: true });
  });
  return app;
}
