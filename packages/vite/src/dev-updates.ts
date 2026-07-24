import type { NormalizedHotChannel } from 'vite';
import type { NormalizedAiI18nOptions, ProjectState } from './project-state.js';
import type { ProviderCoordinator } from './provider-coordinator.js';

interface DevUpdateDependencies {
  options: NormalizedAiI18nOptions;
  state(): ProjectState;
  hot(): NormalizedHotChannel | undefined;
  coordinator(): ProviderCoordinator | undefined;
  translationEvent: string;
  localeEvent: string;
}

export function createDevUpdateSender(dependencies: DevUpdateDependencies) {
  const targetLocales = new Set(
    dependencies.options.locales
      .map((locale) => locale.value)
      .filter((locale) => locale !== dependencies.options.sourceLang),
  );

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
      if (!coordinator) return;
      const project = dependencies.state();
      for (const moduleId of new Set(moduleIds)) {
        for (const request of project.missingTranslations(moduleId)) {
          // Dev 不等待网络；Build 在虚拟模块固化前统一 flush。
          void coordinator.request(request);
        }
      }
    },
  };
}
