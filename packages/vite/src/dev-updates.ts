import type { NormalizedHotChannel } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { NormalizedAiI18nOptions, ProjectState } from './project-state.js';
import type { ProviderCoordinator } from './provider-coordinator.js';

const MISSING_REPORT_DELAY_MS = 100;

interface DevUpdateDependencies {
  options: NormalizedAiI18nOptions;
  state(): ProjectState;
  hot(): NormalizedHotChannel | undefined;
  coordinator(): ProviderCoordinator | undefined;
  reportMissingTranslations?(message: string): void;
  translationEvent: string;
  localeEvent: string;
}

export function createDevUpdateSender(dependencies: DevUpdateDependencies) {
  const targetLocales = new Set(
    dependencies.options.locales
      .map((locale) => locale.value)
      .filter((locale) => locale !== dependencies.options.sourceLang),
  );
  const discoveredModuleIds = new Set<string>();
  let reportTimer: ReturnType<typeof setTimeout> | undefined;
  let lastReportKey: string | undefined;

  function reportMissingTranslations() {
    reportTimer = undefined;
    const missing = new Map<string, Set<string>>();
    const project = dependencies.state();
    for (const moduleId of discoveredModuleIds) {
      for (const request of project.missingTranslations(moduleId)) {
        for (const locale of request.locales) {
          const messageIds = missing.get(locale) ?? new Set<string>();
          messageIds.add(request.messageId);
          missing.set(locale, messageIds);
        }
      }
    }
    const counts = [...missing]
      .map(([locale, messageIds]) => [locale, messageIds.size] as const)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left.localeCompare(right));
    const reportKey = JSON.stringify(counts);
    if (reportKey === lastReportKey) return;
    lastReportKey = reportKey;
    if (!counts.length) return;

    const chinese = counts
      .map(([locale, count]) => `${locale} ${count} 条`)
      .join('、');
    const english = counts
      .map(([locale, count]) => `${locale} ${count}`)
      .join(', ');
    dependencies.reportMissingTranslations?.(
      diagnosticMessage(
        `[ai-i18n] 当前已发现未翻译文案：${chinese}。可配置 provider 自动补齐，或使用 Agent + MCP 处理。`,
        `[ai-i18n] Untranslated messages discovered so far: ${english}. Configure a provider to fill them automatically, or handle them with Agent + MCP.`,
      ),
    );
  }

  function scheduleMissingReport(moduleIds: readonly string[]) {
    if (!dependencies.reportMissingTranslations) return;
    for (const moduleId of moduleIds) discoveredModuleIds.add(moduleId);
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(
      reportMissingTranslations,
      MISSING_REPORT_DELAY_MS,
    );
    reportTimer.unref?.();
  }

  return {
    sendTranslationUpdates(moduleIds: readonly string[]) {
      const project = dependencies.state();
      for (const moduleId of new Set(moduleIds)) {
        const messages = project.registration(
          moduleId,
          dependencies.options.loading
            ? dependencies.options.sourceLang
            : undefined,
        );
        if (messages) {
          dependencies.hot()?.send(dependencies.translationEvent, {
            moduleId,
            messages,
          });
        }
      }
    },

    sendLocaleUpdates(locales: readonly string[]) {
      if (!dependencies.options.loading) return;
      const project = dependencies.state();
      for (const locale of new Set(locales)) {
        if (targetLocales.has(locale)) {
          dependencies.hot()?.send(dependencies.localeEvent, {
            locale,
            messages: project.localeMessages(locale),
          });
        }
      }
    },

    requestMissingTranslations(moduleIds: readonly string[]) {
      const coordinator = dependencies.coordinator();
      if (!coordinator) {
        scheduleMissingReport(moduleIds);
        return;
      }
      const project = dependencies.state();
      for (const moduleId of new Set(moduleIds)) {
        for (const request of project.missingTranslations(moduleId)) {
          // Dev 不等待网络；Build 在虚拟模块固化前统一 flush。
          void coordinator.request(request);
        }
      }
    },

    dispose() {
      if (reportTimer) clearTimeout(reportTimer);
      reportTimer = undefined;
    },
  };
}
