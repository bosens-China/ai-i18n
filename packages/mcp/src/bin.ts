#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAiI18nMcpServer } from './server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: ai-i18n-mcp [--root <workspace-root>]');
    return;
  }
  const workspaceRoot = parseWorkspaceRoot(args);
  const server = createAiI18nMcpServer(workspaceRoot);
  await server.connect(new StdioServerTransport());
}

function parseWorkspaceRoot(args: string[]): string {
  if (!args.length) return process.cwd();
  if (args.length !== 2 || args[0] !== '--root' || !args[1]) {
    throw new Error('Usage: ai-i18n-mcp [--root <workspace-root>]');
  }
  return path.resolve(args[1]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
