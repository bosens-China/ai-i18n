import type { Rolldown, ResolvedConfig } from 'vite';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';

/** 追加到构建插件末尾，等待其他写出钩子成功后才允许删除历史译文。 */
export function buildCleanup(
  config: ResolvedConfig,
  cleanup: () => Promise<unknown>,
  close: () => Promise<void> | undefined,
): Rolldown.Plugin {
  let written = 0;
  let failed = false;
  const output = config.build.rolldownOptions.output;
  const outputs = Array.isArray(output)
    ? output.length
    : output
      ? 1
      : config.build.lib
        ? (config.build.lib.formats?.length ?? 2)
        : 1;
  const finish = async () => {
    try {
      await cleanup();
    } catch (cause) {
      throw new Error(
        diagnosticMessage(
          '[ai-i18n] 构建产物已写出，但历史译文清理失败；产物保留，请检查翻译目录后重试。',
          '[ai-i18n] Build output was written, but translation history cleanup failed. Output is retained; check the translation directory and retry.',
        ),
        { cause },
      );
    }
  };
  return {
    name: 'ai-i18n:build-cleanup',
    buildStart() {
      // Rolldown 每个输出都会触发 buildStart，不能清掉前一个输出的完成计数。
      if (config.build.watch && (failed || written === outputs)) {
        written = 0;
        failed = false;
      }
    },
    buildEnd(error) {
      if (error) failed = true;
    },
    renderError() {
      failed = true;
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        written++;
        if (config.build.watch && !failed && written === outputs)
          await finish();
      },
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        try {
          if (
            !config.build.watch &&
            config.build.write &&
            !failed &&
            written === outputs
          )
            await finish();
        } finally {
          if (!config.build.watch) await close();
        }
      },
    },
  };
}
