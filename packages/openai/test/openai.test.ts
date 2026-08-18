import { describe, expect, it, vi } from 'vitest';
import { openAI } from '../src/index';
import {
  completion,
  singleLocaleBatch,
  startServer,
  translationBatch,
  validOptions,
  validPayload,
  validResults,
  type CapturedRequest,
} from './openai-test-utils';

describe('openAI', () => {
  it('sends a structured batch with user configuration and the required suffix', async () => {
    let captured: CapturedRequest | undefined;
    let requestCount = 0;
    const baseURL = await startServer(async (request, body) => {
      requestCount += 1;
      captured = { request, body };
      return completion(validPayload());
    });
    const translator = openAI({
      baseURL: `${baseURL}/v1/`,
      model: 'chosen-model',
      systemPrompt: 'Translate product interface messages.',
      apiKey: 'secret-key',
      temperature: 0.25,
      maxTokens: 1_024,
      timeoutMs: 5_000,
      maxRetries: 0,
      headers: { 'x-provider-version': '2026-07-22' },
    });

    const results = await translator(translationBatch());

    expect(results).toEqual(validResults());
    expect(requestCount).toBe(1);
    expect(captured?.request.url).toBe('/v1/chat/completions');
    expect(captured?.request.headers.authorization).toBe('Bearer secret-key');
    expect(captured?.request.headers['x-provider-version']).toBe('2026-07-22');
    expect(captured?.body).toMatchObject({
      model: 'chosen-model',
      temperature: 0.25,
      max_tokens: 1_024,
      messages: [{ role: 'system' }, { role: 'user' }],
      response_format: { type: 'json_object' },
    });
    const messages = captured?.body.messages as Array<{ content: string }>;
    expect(messages[0]!.content).toMatch(
      /^Translate product interface messages\.\n\n`\{\{0\}\}`/,
    );
    expect(messages[0]!.content).toContain('`{{=0}}`');
    expect(messages[0]!.content).toContain('与输入下标一一对应');
    expect(messages[0]!.content).toContain(
      '{"translations":[{"en-US":"","ja-JP":""}]}',
    );
    expect(JSON.parse(messages[1]!.content)).toEqual([
      { source: '查询' },
      { source: '查询', comment: '按钮' },
    ]);
  });

  it('keeps hashes in source text separate from comments', async () => {
    let input: unknown;
    const baseURL = await startServer(async (_request, body) => {
      const messages = body.messages as Array<{ content: string }>;
      input = JSON.parse(messages[1]!.content);
      return completion({
        translations: [{ 'en-US': 'Issue #123' }, { 'en-US': 'C# button' }],
      });
    });

    await openAI(validOptions(baseURL))({
      locales: ['en-US'],
      messages: [
        { source: 'Issue #123' },
        { source: 'C#', comment: 'button # label' },
      ],
    });

    expect(input).toEqual([
      { source: 'Issue #123' },
      { source: 'C#', comment: 'button # label' },
    ]);
  });

  it('uses safe defaults and does not leak an environment key to a local endpoint', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'must-not-leak');
    let captured: CapturedRequest | undefined;
    const baseURL = await startServer(async (request, body) => {
      captured = { request, body };
      return completion({
        translations: [{ 'en-US': 'Save' }],
      });
    });

    await openAI({ baseURL, model: 'local-model' })(singleLocaleBatch('保存'));

    expect(captured?.request.headers.authorization).toBe(
      'Bearer local-no-auth',
    );
    expect(captured?.body.temperature).toBe(1);
    expect(
      (captured?.body.messages as Array<{ content: string }>)[0]!.content,
    ).toContain('你是一名专业的软件界面翻译助手');
  });

  it('applies the configured request timeout', async () => {
    const baseURL = await startServer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return completion({
        translations: [{ 'en-US': 'Save' }],
      });
    });

    await expect(
      openAI({
        baseURL,
        model: 'timeout-model',
        timeoutMs: 10,
        maxRetries: 0,
      })(singleLocaleBatch('保存')),
    ).rejects.toThrow('[ai-i18n/openai] translation request failed');
  });

  it('rejects missing, extra, and malformed result rows', async () => {
    const invalidPayloads = [
      { translations: [] },
      {
        translations: [{ 'en-US': 'Save' }, { 'en-US': 'Again' }],
      },
      { translations: [{}] },
      { translations: [{ 'en-US': 'Save', 'ja-JP': '保存' }] },
      { translations: [{ 'en-US': 1 }] },
      { translations: [{ 'en-US': 'Save' }], explanation: 'extra' },
      { translations: 'Save' },
    ];

    for (const payload of invalidPayloads) {
      const baseURL = await startServer(async () => completion(payload));
      const translator = openAI(validOptions(baseURL));
      await expect(translator(singleLocaleBatch('保存'))).rejects.toThrow(
        '[ai-i18n/openai] invalid translation result',
      );
    }
  });

  it('rejects translations that change tagged-template placeholders', async () => {
    const baseURL = await startServer(async () =>
      completion({
        translations: [{ 'en-US': 'Hello' }],
      }),
    );

    await expect(
      openAI(validOptions(baseURL))(singleLocaleBatch('你好 {{0}}')),
    ).rejects.toThrow('changed template placeholders');
  });

  it('preserves escaped literal tokens separately from runtime values', async () => {
    const validURL = await startServer(async () =>
      completion({
        translations: [
          {
            'en-US': 'Current: {{0}}; syntax: {{=0}}',
          },
        ],
      }),
    );
    await expect(
      openAI(validOptions(validURL))(
        singleLocaleBatch('语法：{{=0}}；当前：{{0}}'),
      ),
    ).resolves.toHaveLength(1);

    const invalidURL = await startServer(async () =>
      completion({
        translations: [
          {
            'en-US': 'Syntax: {{0}}; current: {{0}}',
          },
        ],
      }),
    );
    await expect(
      openAI(validOptions(invalidURL))(
        singleLocaleBatch('语法：{{=0}}；当前：{{0}}'),
      ),
    ).rejects.toThrow('changed template placeholders');
  });

  it('does not request the service for an empty batch', async () => {
    let requested = false;
    const baseURL = await startServer(async () => {
      requested = true;
      return completion({ translations: [] });
    });

    await expect(
      openAI(validOptions(baseURL))({ locales: ['en-US'], messages: [] }),
    ).resolves.toEqual([]);
    expect(requested).toBe(false);
  });

  it('rejects malformed locales and messages before requesting the service', async () => {
    let requestCount = 0;
    const baseURL = await startServer(async () => {
      requestCount += 1;
      return completion({ translations: [{ 'en-US': 'Save' }] });
    });
    const translator = openAI(validOptions(baseURL));

    await expect(
      translator({ locales: [' '], messages: [{ source: '保存' }] }),
    ).rejects.toThrow('[ai-i18n/openai] invalid target locales');
    await expect(
      translator({
        locales: ['en-US'],
        messages: [{ source: '保存', context: 'button' }],
      } as never),
    ).rejects.toThrow('[ai-i18n/openai] invalid translation messages');
    await expect(
      translator({
        locales: ['en-US'],
        messages: [{ source: '保存', comment: 1 }],
      } as never),
    ).rejects.toThrow('[ai-i18n/openai] invalid translation messages');
    expect(requestCount).toBe(0);
  });

  it('localizes invalid target locale diagnostics', async () => {
    const translator = openAI(validOptions());
    const batch = {
      locales: ['en-US', 'en-US'],
      messages: [{ source: '保存' }],
    };

    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
    await expect(translator(batch)).rejects.toThrow(
      '[ai-i18n/openai] 目标语言列表无效',
    );
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'en-US');
    await expect(translator(batch)).rejects.toThrow(
      '[ai-i18n/openai] invalid target locales',
    );
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'fr-FR');
    await expect(translator(batch)).rejects.toThrow(
      'AI_I18N_DIAGNOSTIC_LOCALE',
    );
  });

  it('reports HTTP and response shape failures without exposing response data', async () => {
    const errorURL = await startServer(async () => ({
      status: 401,
      body: { error: 'secret provider details' },
    }));
    const invalidURL = await startServer(async () => ({
      body: { choices: [] },
    }));

    const error = await openAI(validOptions(errorURL))(
      singleLocaleBatch('保存'),
    ).catch((cause: unknown) => cause);
    expect(error).toEqual(
      new Error('[ai-i18n/openai] request failed with status 401'),
    );
    await expect(
      openAI(validOptions(invalidURL))(singleLocaleBatch('保存')),
    ).rejects.toThrow('[ai-i18n/openai] translation request failed');
  });

  it('validates required and bounded configuration', () => {
    expect(() => openAI({ ...validOptions(), baseURL: ' ' })).toThrow(
      'baseURL is required',
    );
    expect(() => openAI({ ...validOptions(), model: ' ' })).toThrow(
      'model is required',
    );
    expect(() => openAI({ ...validOptions(), systemPrompt: ' ' })).toThrow(
      'systemPrompt is required',
    );
    expect(() => openAI({ ...validOptions(), maxRetries: -1 })).toThrow(
      'maxRetries must be a non-negative integer',
    );
    expect(() => openAI({ ...validOptions(), temperature: Infinity })).toThrow(
      'temperature must be a number',
    );
    expect(() => openAI({ ...validOptions(), timeoutMs: 0 })).toThrow(
      'timeoutMs must be a positive integer',
    );
    expect(() => openAI({ ...validOptions(), maxTokens: 1.5 })).toThrow(
      'maxTokens must be a positive integer',
    );
    expect(() => openAI({ ...validOptions(), headers: 1 as never })).toThrow(
      'headers must be valid HeadersInit',
    );
    expect(() =>
      openAI({
        ...validOptions(),
        langSmith: { apiKey: ' ' },
      }),
    ).toThrow('langSmith.apiKey is required');

    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
    expect(() => openAI({ ...validOptions(), baseURL: ' ' })).toThrow(
      '[ai-i18n/openai] 配置无效：baseURL为必填项',
    );
  });
});
