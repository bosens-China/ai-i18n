import { describe, expect, it } from 'vitest';
import { formatSDKLog } from '../src/log-format';

describe('OpenAI audit log formatting', () => {
  it('keeps every input message and only configured request parameters', () => {
    const log = formatSDKLog(
      'DEBUG',
      '[log_request] sending request',
      [
        {
          method: 'post',
          url: 'https://example.com/chat/completions',
          options: {
            body: {
              model: 'audit-model',
              temperature: 0,
              max_tokens: undefined,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: '完整系统提示词' },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: '完整用户请求' },
                    { type: 'image_url', image_url: { url: 'data:image/png' } },
                  ],
                },
                { role: 'assistant', content: '历史回复' },
                { role: 'tool', tool_call_id: 'call_1', content: '工具结果' },
              ],
            },
            apiKey: 'must-not-appear',
            dangerouslyAllowBrowser: true,
            __security: { bearerAuth: true },
          },
          headers: { 'x-stainless-lang': 'js' },
        },
      ],
      ['must-not-appear'],
    );

    expect(log).toContain('requestId: log_request');
    expect(log).toContain('model: audit-model');
    expect(log).toContain('temperature: 0');
    expect(log).toContain("type: 'json_object'");
    expect(log).toContain('[SYSTEM]\n完整系统提示词');
    expect(log).toContain('[USER]');
    expect(log).toContain('完整用户请求');
    expect(log).toContain('data:image/png');
    expect(log).toContain('[ASSISTANT]\n历史回复');
    expect(log).toContain('[TOOL]\n工具结果');
    expect(log).toContain("tool_call_id: 'call_1'");
    expect(log).not.toContain('max_tokens');
    expect(log).not.toContain('apiKey');
    expect(log).not.toContain('dangerouslyAllowBrowser');
    expect(log).not.toContain('__security');
    expect(log).not.toContain('x-stainless');
    expect(log).not.toContain('must-not-appear');
  });

  it('keeps reasoning, assistant content and every message extension', () => {
    const log = formatSDKLog(
      'DEBUG',
      '[log_response] response parsed',
      [
        {
          status: 200,
          durationMs: 321,
          body: {
            id: 'response-id',
            model: 'audit-model',
            provider_extension: { trace: 'kept' },
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  reasoning_content: '完整思考',
                  content: '完整回复',
                  refusal: null,
                  tool_calls: [{ id: 'call_1', type: 'function' }],
                  provider_message_field: { value: 'kept' },
                },
                provider_choice_field: 'kept',
              },
              {
                index: 1,
                finish_reason: 'length',
                message: {
                  role: 'assistant',
                  content: [{ type: 'output_text', text: '第二候选' }],
                },
              },
            ],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              completion_tokens_details: { reasoning_tokens: 6 },
            },
          },
        },
      ],
      [],
    );

    expect(log).toContain('requestId: log_response');
    expect(log).toContain('provider_extension');
    expect(log).toContain('[CHOICE 0]');
    expect(log).toContain('finishReason: stop');
    expect(log).toContain('[REASONING]\n完整思考');
    expect(log).toContain('[ASSISTANT]\n完整回复');
    expect(log).toContain('refusal: null');
    expect(log).toContain('tool_calls');
    expect(log).toContain('provider_message_field');
    expect(log).toContain('provider_choice_field');
    expect(log).toContain('[CHOICE 1]');
    expect(log).toContain('第二候选');
    expect(log).toContain('reasoning_tokens: 6');
  });

  it('drops redundant success transport events but keeps errors', () => {
    expect(
      formatSDKLog(
        'INFO',
        '[log_request] post example succeeded with status 200',
        [],
        [],
      ),
    ).toBeUndefined();
    expect(
      formatSDKLog(
        'DEBUG',
        '[log_request] response start',
        [{ status: 200 }],
        [],
      ),
    ).toBeUndefined();

    const error = formatSDKLog(
      'DEBUG',
      '[log_request] response error (error; not retryable)',
      [{ status: 400, durationMs: 50, message: 'invalid request' }],
      [],
    );
    expect(error).toContain('TRANSPORT ERROR');
    expect(error).toContain('requestId: log_request');
    expect(error).toContain('status: 400');
    expect(error).toContain('event: response error (error; not retryable)');
    expect(error).toContain('message: invalid request');
  });
});
