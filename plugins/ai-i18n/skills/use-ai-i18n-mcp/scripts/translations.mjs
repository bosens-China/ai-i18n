import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// 无 Host MCP 连接时仍走同一套 schema、消息身份、锁和写入校验。
const { values } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    input: { type: 'string' },
  },
});
try {
  const require = createRequire(
    path.join(path.resolve(values.root), 'package.json'),
  );
  const { callTranslationTool } = await import(
    pathToFileURL(require.resolve('@ai-i18n/mcp/internal/agent')).href
  );
  let json = values.input
    ? await fs.readFile(path.resolve(values.input), 'utf8')
    : '';
  if (!values.input) for await (const chunk of process.stdin) json += chunk;
  const input = JSON.parse(json);
  const result = await callTranslationTool(input);
  console.log(JSON.stringify(result));
  if (result.isError) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
