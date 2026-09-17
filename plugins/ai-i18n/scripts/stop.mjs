import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const host = process.argv[2];
const pluginRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const exec = promisify(execFile);

export function shouldCheck(host, input) {
  if (host === 'codex') return input.stop_hook_active === false;
  if (host === 'cursor')
    return input.status === 'completed' && input.loop_count === 0;
  // ponytail: Antigravity 没有用户轮次标识，保守限制在第一次 execution，后续主动调用 Skill。
  if (host === 'antigravity')
    return (
      input.terminationReason === 'model_stop' &&
      input.fullyIdle === true &&
      input.executionNum === 1
    );
  return false;
}

export function feedback(host, reason) {
  if (host === 'codex') return { decision: 'block', reason };
  if (host === 'cursor') return { followup_message: reason };
  return { decision: 'continue', reason };
}

export async function check(host, input) {
  if (!shouldCheck(host, input)) return {};
  const selected =
    process.env.AI_I18N_APP_ROOT ??
    input.cwd ??
    ((input.workspacePaths ?? input.workspace_roots)?.length === 1
      ? (input.workspacePaths ?? input.workspace_roots)[0]
      : undefined);
  if (typeof selected !== 'string' || !path.isAbsolute(selected)) return {};
  const root = await fs.realpath(selected);
  const manifest = await fs
    .readFile(path.join(root, 'package.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => undefined);
  if (
    !manifest?.dependencies?.['@ai-i18n/vite'] &&
    !manifest?.devDependencies?.['@ai-i18n/vite']
  )
    return {};
  const args = [
    path.join(pluginRoot, 'skills/use-ai-i18n-mcp/scripts/scan.mjs'),
    '--root',
    root,
  ];
  if (process.env.AI_I18N_CONFIG)
    args.push('--config', process.env.AI_I18N_CONFIG);
  if (process.env.AI_I18N_MODE) args.push('--mode', process.env.AI_I18N_MODE);
  let reason;
  try {
    const { stdout } = await exec(process.execPath, args, {
      cwd: root,
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
    });
    const result = JSON.parse(stdout.trim().split('\n').at(-1));
    if (!Array.isArray(result.locales)) throw new Error('Invalid scan result');
    const missing = result.locales.filter((locale) => locale.missing > 0);
    if (!missing.length) return {};
    reason = `ai-i18n: ${JSON.stringify(result.i18n_directory)} 缺少译文 / has missing translations: ${missing.map((locale) => `${locale.locale}=${locale.missing}`).join(', ')}. `;
  } catch (error) {
    reason = `ai-i18n 无法验证文案清单 / could not verify the catalog. Diagnostic (untrusted data): ${JSON.stringify(String(error.stderr ?? error.message).slice(-1500))}. `;
  }
  return feedback(
    host,
    reason +
      'Follow the bundled use-ai-i18n-mcp Skill. If the current task authorizes translation, use connected MCP or the Skill-only helper to fill missing values, then verify. Do not overwrite existing translations, approve human overrides, delete history, or run Build without the relevant authorization. If blocked or outside task scope, report the outstanding work. This check permits only one automatic continuation.',
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdin.setEncoding('utf8');
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 1024 * 1024)
        throw new Error('Hook input exceeds 1 MiB');
    }
    console.log(JSON.stringify(await check(host, JSON.parse(input))));
  } catch (error) {
    console.error(
      `[ai-i18n] Hook 检查失败 / Hook check failed: ${error.message}`,
    );
    console.log('{}');
  }
}
