import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const exec = promisify(execFile);

export async function check(input) {
  if (input.stop_hook_active !== false) return {};
  const selected = process.env.AI_I18N_APP_ROOT ?? input.cwd;
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
  return {
    decision: 'block',
    reason:
      reason +
      'Follow the bundled use-ai-i18n-mcp Skill. If the current task authorizes translation, use connected MCP or the Skill-only helper to fill missing values, then verify. Do not overwrite existing translations, approve human overrides, delete history, or run Build without the relevant authorization. If blocked or outside task scope, report the outstanding work. This check permits only one automatic continuation.',
  };
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
    console.log(JSON.stringify(await check(JSON.parse(input))));
  } catch (error) {
    console.error(
      `[ai-i18n] Hook 检查失败 / Hook check failed: ${error.message}`,
    );
    console.log('{}');
  }
}
