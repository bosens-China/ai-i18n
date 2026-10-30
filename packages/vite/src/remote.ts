import type { TranslationMessage } from '@ai-i18n/core';
import type { TranslationMeta } from './runtime.js';

export interface RemoteMessage extends TranslationMessage {
  readonly occurrences: readonly Readonly<{
    file: string;
    line: number;
    column: number;
  }>[];
}

export interface RemoteContext {
  readonly command: 'serve' | 'build';
  readonly sourceLang: string;
  /** 只包含目标语言，不包含源语言。 */
  readonly locales: readonly string[];
  readonly messages: readonly Readonly<RemoteMessage>[];
  /** 单次操作最多 30 秒；请求应将此 signal 传给 fetch。 */
  readonly signal: AbortSignal;
}

export interface RemoteTranslation {
  readonly message: TranslationMessage;
  readonly locale: string;
  readonly value: string | null;
}

export interface RemoteSnapshot {
  readonly translations: readonly RemoteTranslation[];
  /** 仅显式选择的 JSON 对象会进入浏览器。 */
  readonly publicMeta?: TranslationMeta;
}

export interface RemoteAdapter {
  /** replace（默认）替换自动译文；overlay 以最高优先级叠加到本地译文。 */
  mode?: 'replace' | 'overlay';
  /** 新增或更新文案；返回仅表示提交完成，不表示翻译完成。 */
  publish?(context: RemoteContext): Promise<void>;
  /** 返回当前完整远程层；overlay 中省略或 null 表示使用本地译文。 */
  load?(context: RemoteContext): Promise<RemoteSnapshot>;
}

/** 为独立文件或内联配置提供相同的上下文类型提示。 */
export function defineRemote(adapter: RemoteAdapter): RemoteAdapter {
  return adapter;
}
