import { expect, it, vi } from 'vitest';
import { createDemoServer } from '../server/app.js';
import { messageKey, saveKey } from '../server/catalog.js';

const post = (body: unknown, origin?: string) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(origin ? { Origin: origin } : {}),
  },
  body: JSON.stringify(body),
});

it('accepts key-only idempotent submissions and exposes a global versioned dictionary', async () => {
  const app = createDemoServer();
  const response = await app.request(
    '/api/sources',
    post({ keys: [saveKey, saveKey] }),
  );
  expect(response.status).toBe(202);
  const snapshot = await (await app.request('/api/locales/en.json')).json();
  expect(snapshot).toMatchObject({
    version: 'demo-1',
    messages: { [saveKey]: 'Saved successfully' },
  });
  const status = await (await app.request('/api/status')).json();
  expect(status).toMatchObject({ keys: [saveKey], publishes: 1, loads: 1 });
});

it('keeps comment identities separate and rejects malformed or cross-origin writes', async () => {
  const app = createDemoServer();
  const submit = messageKey({ source: '提交', comment: '表单按钮' });
  const commit = messageKey({ source: '提交', comment: 'Git 操作' });
  await app.request('/api/sources', post({ keys: [submit, commit] }));
  const snapshot = await (await app.request('/api/locales/en.json')).json();
  expect(snapshot.messages).toMatchObject({
    [submit]: 'Submit',
    [commit]: 'Commit',
  });
  expect(
    (await app.request('/api/sources', post({ keys: ['bad'] }))).status,
  ).toBe(400);
  expect(
    (
      await app.request(
        '/api/sources',
        post({ keys: [saveKey] }, 'https://unrelated.example'),
      )
    ).status,
  ).toBe(403);
  expect(
    (await app.request('/api/demo/scenario', post({ scenario: 'unknown' })))
      .status,
  ).toBe(400);
  expect(
    (await app.request('/api/sources', { method: 'POST', body: '{}' })).status,
  ).toBe(415);
});

it('models pending and invalid results separately from successful submission', async () => {
  const app = createDemoServer();
  await app.request('/api/sources', post({ keys: [saveKey] }));
  await app.request('/api/demo/scenario', post({ scenario: 'pending' }));
  const pending = await (await app.request('/api/locales/en.json')).json();
  expect(pending.version).toBe('demo-2');
  expect(Object.hasOwn(pending.messages, saveKey)).toBe(false);
  await app.request('/api/demo/scenario', post({ scenario: 'invalid' }));
  const invalid = await (await app.request('/api/locales/en.json')).json();
  expect(invalid.messages[saveKey]).toBe('{{999}}');
  await app.request('/api/demo/scenario', post({ scenario: 'ready' }));
  const ready = await (await app.request('/api/locales/en.json')).json();
  expect(ready).toMatchObject({
    version: 'demo-4',
    messages: { [saveKey]: 'Changes saved' },
  });
});

it('only permits a restart when a Dev runner supplies the operation', async () => {
  expect(
    (await createDemoServer().request('/api/demo/restart', post({}))).status,
  ).toBe(409);
  vi.useFakeTimers();
  try {
    const restart = vi.fn(async () => {});
    const app = createDemoServer({ restart });
    expect((await app.request('/api/demo/restart', post({}))).status).toBe(200);
    expect(restart).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(restart).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it('provides a partial priority layer and supports withdrawing it', async () => {
  const app = createDemoServer({ scenario: 'partial' });
  const other = messageKey({ source: '语言' });
  await app.request('/api/sources', post({ keys: [saveKey, other] }));
  const partial = await (await app.request('/api/locales/en.json')).json();
  expect(partial.messages[saveKey]).toBe('Priority server copy');
  expect(Object.hasOwn(partial.messages, other)).toBe(false);
  await app.request('/api/demo/scenario', post({ scenario: 'withdrawn' }));
  const withdrawn = await (await app.request('/api/locales/en.json')).json();
  expect(Object.hasOwn(withdrawn.messages, saveKey)).toBe(false);
});
