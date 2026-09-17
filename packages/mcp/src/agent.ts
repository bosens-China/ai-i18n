import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { createAiI18nMcpServer } from './server.js';

const Request = z
  .object({
    name: z.enum(['ai_i18n_list_translations', 'ai_i18n_set_translations']),
    arguments: z.record(z.string(), z.unknown()),
  })
  .strict();

/** Skill-only 的普通补译桥接；不另写协议文件操作或绕过工具参数校验。 */
export async function callTranslationTool(request: unknown) {
  const input = Request.parse(request);
  const server = createAiI18nMcpServer();
  const client = new Client({ name: 'ai-i18n-skill', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return await client.callTool(input);
  } finally {
    await client.close();
    await server.close();
  }
}
