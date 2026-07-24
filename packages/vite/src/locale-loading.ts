import path from 'node:path';
import type { TranslationValue } from '@ai-i18n/core';
import type {
  HtmlTagDescriptor,
  IndexHtmlTransformContext,
  ResolvedConfig,
} from 'vite';
import type { NormalizedAiI18nOptions } from './project-state.js';

const VIRTUAL_LOCALE_PREFIX = 'virtual:ai-i18n/locale/';
const DEV_LOCALE_WRAPPER_PREFIX = `${VIRTUAL_LOCALE_PREFIX}__dev_wrapper__/`;
const PUBLIC_LOCALE_PREFIX = '/@ai-i18n/locale/';

export const RESOLVED_LOCALE_PREFIX = `\0${VIRTUAL_LOCALE_PREFIX}`;
const RESOLVED_DEV_LOCALE_WRAPPER_PREFIX = `\0${DEV_LOCALE_WRAPPER_PREFIX}`;

export function localeModuleId(locale: string): string {
  return `${VIRTUAL_LOCALE_PREFIX}${encodeURIComponent(locale)}`;
}

export function resolvedLocaleModuleId(locale: string): string {
  return `\0${localeModuleId(locale)}`;
}

export function resolvedLocaleRequestId(id: string, locale: string): string {
  return id.split('?')[0]!.startsWith(VIRTUAL_LOCALE_PREFIX)
    ? resolvedLocaleModuleId(locale)
    : `${RESOLVED_DEV_LOCALE_WRAPPER_PREFIX}${encodeURIComponent(locale)}`;
}

export function publicLocaleModuleId(locale: string, base = '/'): string {
  const prefix =
    base && base !== './'
      ? `${base.endsWith('/') ? base : `${base}/`}`.replace(/\/+$/, '/')
      : '/';
  return `${prefix}${PUBLIC_LOCALE_PREFIX.slice(1)}${encodeURIComponent(locale)}.js`;
}

export function localeFromRequest(id: string): string | undefined {
  const cleanId = id.split('?')[0]!;
  if (cleanId.startsWith(VIRTUAL_LOCALE_PREFIX)) {
    return decodeURIComponent(cleanId.slice(VIRTUAL_LOCALE_PREFIX.length));
  }
  const publicIndex = cleanId.indexOf(PUBLIC_LOCALE_PREFIX);
  if (publicIndex < 0 || !cleanId.endsWith('.js')) return;
  return decodeURIComponent(
    cleanId.slice(publicIndex + PUBLIC_LOCALE_PREFIX.length, -'.js'.length),
  );
}

export function localeFromResolvedId(id: string): string | undefined {
  if (
    !id.startsWith(RESOLVED_LOCALE_PREFIX) ||
    id.startsWith(RESOLVED_DEV_LOCALE_WRAPPER_PREFIX)
  ) {
    return;
  }
  return decodeURIComponent(id.slice(RESOLVED_LOCALE_PREFIX.length));
}

export function localeFromResolvedWrapperId(id: string): string | undefined {
  if (!id.startsWith(RESOLVED_DEV_LOCALE_WRAPPER_PREFIX)) return;
  return decodeURIComponent(
    id.slice(RESOLVED_DEV_LOCALE_WRAPPER_PREFIX.length),
  );
}

export function localeModuleCode(
  messages: Record<string, TranslationValue>,
): string {
  return `
const messages = ${JSON.stringify(messages)};
export default messages;
if (import.meta.hot) import.meta.hot.accept();
`;
}

export function localeModuleWrapperCode(locale: string): string {
  return `
// modulepreload 只预取 wrapper，避免在业务模块完成分析前冻结不完整的语言快照。
const messages = import(${JSON.stringify(localeModuleId(locale))}).then((module) => module.default);
export default messages;
if (import.meta.hot) import.meta.hot.accept();
`;
}

export function localeModulePlaceholderCode(locale: string): string {
  return `export default ${JSON.stringify(localePlaceholder(locale))};`;
}

export function fillLocaleModule(
  code: string,
  locale: string,
  messages: Record<string, TranslationValue>,
): string {
  const marker = localePlaceholder(locale).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  return code.replace(
    new RegExp(`(["'\`])${marker}\\1`),
    JSON.stringify(messages),
  );
}

export function localeLoadersCode(
  options: NormalizedAiI18nOptions,
  build: boolean,
  base: string,
): string {
  if (!options.loading) return 'undefined';
  return `{
${options.locales
  .filter((locale) => locale.value !== options.sourceLang)
  .map((locale) => {
    const id = build
      ? localeModuleId(locale.value)
      : publicLocaleModuleId(locale.value, base);
    return `${JSON.stringify(locale.value)}: () => import(${JSON.stringify(id)}).then((module) => module.default)`;
  })
  .join(',\n')}
}`;
}

export function localeHintTags(
  config: ResolvedConfig,
  context: IndexHtmlTransformContext,
  options: NormalizedAiI18nOptions,
): HtmlTagDescriptor[] {
  if (!options.loading) return [];
  return [
    ...hintTags(config, context, options.loading.preload, 'modulepreload'),
    ...hintTags(config, context, options.loading.prefetch, 'prefetch'),
  ];
}

export function injectBuiltLocaleHints(
  bundle: NonNullable<IndexHtmlTransformContext['bundle']>,
  config: ResolvedConfig,
  options: NormalizedAiI18nOptions,
): void {
  if (!options.loading) return;
  const hints = [
    ...builtHints(bundle, options.loading.preload, 'modulepreload'),
    ...builtHints(bundle, options.loading.prefetch, 'prefetch'),
  ];
  if (!hints.length) return;

  for (const item of Object.values(bundle)) {
    if (
      item.type !== 'asset' ||
      !item.fileName.endsWith('.html') ||
      typeof item.source !== 'string'
    ) {
      continue;
    }
    const source = item.source;
    const tags = hints
      .filter(
        ({ locale }) => !source.includes(`data-ai-i18n-locale="${locale}"`),
      )
      .map(({ locale, fileName, rel }) => {
        const href = outputUrl(config.base, item.fileName, fileName);
        return `<link rel="${rel}" href="${href}" data-ai-i18n-locale="${locale}">`;
      })
      .join('');
    if (!tags) continue;
    item.source = /<\/head>/i.test(source)
      ? source.replace(/<\/head>/i, `${tags}</head>`)
      : `${tags}${source}`;
  }
}

function hintTags(
  config: ResolvedConfig,
  context: IndexHtmlTransformContext,
  locales: readonly string[],
  rel: 'modulepreload' | 'prefetch',
): HtmlTagDescriptor[] {
  return locales.flatMap((locale) => {
    const href = context.bundle
      ? builtLocaleUrl(config, context, locale)
      : config.command === 'serve'
        ? publicLocaleModuleId(locale, config.base)
        : undefined;
    return href
      ? [
          {
            tag: 'link',
            attrs: {
              rel,
              href,
              'data-ai-i18n-locale': locale,
            },
            injectTo: 'head' as const,
          },
        ]
      : [];
  });
}

function builtHints(
  bundle: NonNullable<IndexHtmlTransformContext['bundle']>,
  locales: readonly string[],
  rel: 'modulepreload' | 'prefetch',
) {
  return locales.flatMap((locale) => {
    const chunk = Object.values(bundle).find(
      (item) =>
        item.type === 'chunk' &&
        item.facadeModuleId === resolvedLocaleModuleId(locale),
    );
    return chunk && chunk.type === 'chunk'
      ? [{ locale, fileName: chunk.fileName, rel }]
      : [];
  });
}

function outputUrl(base: string, htmlFile: string, assetFile: string): string {
  if (base && base !== './') return `${base}${assetFile}`;
  const relative = path.posix.relative(path.posix.dirname(htmlFile), assetFile);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function localePlaceholder(locale: string): string {
  return `__AI_I18N_LOCALE_${encodeURIComponent(locale)}__`;
}

function builtLocaleUrl(
  config: ResolvedConfig,
  context: IndexHtmlTransformContext,
  locale: string,
): string | undefined {
  const chunk = Object.values(context.bundle ?? {}).find(
    (item) =>
      item.type === 'chunk' &&
      item.facadeModuleId === resolvedLocaleModuleId(locale),
  );
  if (!chunk || chunk.type !== 'chunk') return;
  if (config.base && config.base !== './') {
    return `${config.base}${chunk.fileName}`;
  }
  const htmlFile = path
    .relative(config.root, context.filename)
    .split(path.sep)
    .join('/');
  const relative = path.posix.relative(
    path.posix.dirname(htmlFile),
    chunk.fileName,
  );
  return relative.startsWith('.') ? relative : `./${relative}`;
}
