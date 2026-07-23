import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  model: undefined as Record<string, unknown> | undefined,
  client: undefined as Record<string, unknown> | undefined,
  clientInstance: undefined as object | undefined,
  tracer: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(fields: Record<string, unknown>) {
      captured.model = fields;
    }

    withStructuredOutput() {
      return { invoke: async () => ({ translations: [] }) };
    }
  },
}));

vi.mock('langsmith', () => ({
  Client: class {
    constructor(fields: Record<string, unknown>) {
      captured.client = fields;
      captured.clientInstance = this;
    }
  },
}));

vi.mock('@langchain/core/tracers/tracer_langchain', () => ({
  LangChainTracer: class {
    constructor(fields: Record<string, unknown>) {
      captured.tracer = fields;
    }
  },
}));

import { openAI } from '../src/index';

beforeEach(() => {
  captured.model = undefined;
  captured.client = undefined;
  captured.clientInstance = undefined;
  captured.tracer = undefined;
});

describe('openAI options', () => {
  it('passes the documented defaults to ChatOpenAI', () => {
    openAI({ baseURL: 'http://127.0.0.1:11434/v1', model: 'local' });

    expect(captured.model).toMatchObject({
      model: 'local',
      apiKey: 'local-no-auth',
      temperature: 1,
      timeout: 120_000,
      maxRetries: 3,
      useResponsesApi: false,
      configuration: { baseURL: 'http://127.0.0.1:11434/v1' },
    });
  });

  it('enables a programmatic LangSmith tracer only when configured', () => {
    openAI({
      baseURL: 'https://example.com/v1',
      model: 'model',
      langSmith: {
        apiKey: 'langsmith-key',
        project: 'ai-i18n',
        endpoint: 'https://smith.example.com',
        workspaceId: 'workspace',
      },
    });

    expect(captured.client).toEqual({
      apiKey: 'langsmith-key',
      apiUrl: 'https://smith.example.com',
      workspaceId: 'workspace',
    });
    expect(captured.tracer).toMatchObject({
      projectName: 'ai-i18n',
      client: captured.clientInstance,
    });
    expect(captured.model?.callbacks).toHaveLength(1);
  });
});
