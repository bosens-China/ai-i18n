import type { TranslationValue } from './schema.js';

export interface TranslationMessage {
  source: string;
  comment?: string;
}

/** Translator 批次日志状态；false 表示关闭，字符串表示已解析的日志目录。 */
export type TranslationLogging = false | string;

export interface TranslationBatch {
  /** 由调度器分配的诊断 ID；不参与消息身份、缓存或模型提示词。 */
  batchId?: string;
  /** 本批诊断日志目录；false 或省略表示关闭，自定义 Translator 可选择支持。 */
  logging?: TranslationLogging;
  locales: readonly string[];
  messages: readonly TranslationMessage[];
}

export type TranslationResult = Readonly<Record<string, TranslationValue>>;

export type TranslationBatchStage =
  'scheduled' | 'state-applied' | 'persisted' | 'failed';

interface TranslationBatchEventBase {
  batchId: string;
  /** 与对应批次一致的诊断日志目录；false 表示关闭。 */
  logging: TranslationLogging;
}

export type TranslationBatchEvent =
  | (TranslationBatchEventBase & {
      stage: 'scheduled';
      locales: readonly string[];
      messageCount: number;
    })
  | (TranslationBatchEventBase & {
      stage: 'state-applied';
      resultCount: number;
      affectedModules: number;
    })
  | (TranslationBatchEventBase & { stage: 'persisted' })
  | (TranslationBatchEventBase & {
      stage: 'failed';
      locales: readonly string[];
      messageCount: number;
      reason: string;
    });

export type Translator = ((
  batch: TranslationBatch,
) => Promise<readonly TranslationResult[]>) & {
  /** 可选诊断接收器；失败不能改变翻译结果。 */
  reportBatchEvent?: (event: TranslationBatchEvent) => void | Promise<void>;
};
