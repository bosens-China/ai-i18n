import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfigFromFile, type ConfigEnv } from 'vite';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import type { AiI18nOptions } from './options.js';
import { normalizeOptions, rejectRemovedOptions } from './plugin-utils.js';
import { validateRemote } from './remote-validation.js';

export interface AiI18nConfig extends AiI18nOptions {
  /** 应用的 Vite root，相对于本配置文件；默认当前目录。 */
  root?: string;
}
export type AiI18nConfigExport =
  AiI18nConfig | ((env: ConfigEnv) => AiI18nConfig | Promise<AiI18nConfig>);
export function defineConfig(config: AiI18nConfigExport): AiI18nConfigExport {
  return config;
}

/** 只加载明确选定的配置，不执行 vite.config，也不启动 Provider。 */
export async function loadAiI18nConfig(
  configFile: string,
  env: ConfigEnv = { command: 'serve', mode: 'development' },
) {
  const file = await fs.realpath(configFile).catch(() => {
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] 找不到配置文件：${configFile}。请创建 ai-i18n.config.ts。`,
        `[ai-i18n] Config file not found: ${configFile}. Create ai-i18n.config.ts.`,
      ),
    );
  });
  const base = path.dirname(file);
  const loaded = await loadConfigFromFile(env, file, base, 'silent');
  const value = loaded?.config as AiI18nConfig | undefined;
  if (
    !value ||
    typeof value.sourceLang !== 'string' ||
    !Array.isArray(value.locales)
  )
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 配置必须包含 sourceLang 和 locales。',
        '[ai-i18n] Config must contain sourceLang and locales.',
      ),
    );
  if (
    value.locales.some(
      (locale) =>
        !locale ||
        typeof locale.value !== 'string' ||
        typeof locale.label !== 'string',
    ) ||
    [value.root, value.directory].some(
      (item) =>
        item !== undefined && (typeof item !== 'string' || !item.trim()),
    ) ||
    (value.dts !== undefined &&
      value.dts !== false &&
      (typeof value.dts !== 'string' || !value.dts.trim()))
  )
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 配置中的语言或路径字段无效。',
        '[ai-i18n] Invalid language or path fields in config.',
      ),
    );
  rejectRemovedOptions(value);
  normalizeOptions(value);
  validateRemote(value.remote, value.provider);
  const root = await fs.realpath(path.resolve(base, value.root ?? '.'));
  const options: AiI18nOptions = {
    ...value,
    directory: path.resolve(base, value.directory ?? 'i18n'),
    dts:
      value.dts === false
        ? false
        : path.resolve(base, value.dts ?? 'src/ai-i18n.d.ts'),
    ...(value.provider
      ? {
          provider: {
            ...value.provider,
            ...(value.provider.logging
              ? {
                  logging: path.resolve(
                    base,
                    typeof value.provider.logging === 'string'
                      ? value.provider.logging
                      : 'logs',
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
  return {
    configFile: file,
    root,
    options,
    dependencies: [...new Set([file, ...(loaded?.dependencies ?? [])])],
  };
}
