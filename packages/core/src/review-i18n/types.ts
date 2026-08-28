export type ReviewCopyTextKey =
  | 'all'
  | 'allExtractedScope'
  | 'allFiles'
  | 'allPagesScope'
  | 'appearance'
  | 'backToBrowse'
  | 'browseScope'
  | 'chooseExactOccurrence'
  | 'closeWorkbench'
  | 'confirm'
  | 'confirmAndContinue'
  | 'continue'
  | 'currentFile'
  | 'currentOccurrence'
  | 'currentPageScope'
  | 'enterTranslation'
  | 'filtersLabel'
  | 'final'
  | 'interfaceLanguage'
  | 'languageChinese'
  | 'languageEnglish'
  | 'languageSystem'
  | 'localesLabel'
  | 'locateHint'
  | 'locateResults'
  | 'machine'
  | 'noMachine'
  | 'noMessages'
  | 'noResults'
  | 'openInVsCode'
  | 'openReview'
  | 'pickFromPage'
  | 'pickerNoMatch'
  | 'progressLabel'
  | 'remove'
  | 'removed'
  | 'resizeWorkbench'
  | 'reviewDataFailed'
  | 'reviewQueue'
  | 'reviewTitle'
  | 'reviewed'
  | 'saveAndContinue'
  | 'saveChanges'
  | 'saved'
  | 'savedState'
  | 'scope'
  | 'search'
  | 'selectMessage'
  | 'settings'
  | 'settingsHint'
  | 'settingsLabel'
  | 'shortcutContinue'
  | 'shortcutMachine'
  | 'shortcutNav'
  | 'shortcutSave'
  | 'standaloneEyebrow'
  | 'standaloneSubtitle'
  | 'statusLabel'
  | 'suffixLabel'
  | 'tabSettings'
  | 'themeDark'
  | 'themeLight'
  | 'themeSystem'
  | 'tokenError'
  | 'tokenMismatch'
  | 'tokens'
  | 'unreviewed'
  | 'unsaved'
  | 'useAutomatic'
  | 'workbenchFrame'
  | 'workbenchLoadFailed'
  | 'workbenchLoading'
  | 'workbenchTabsLabel';

export interface ReviewProgressSummary {
  remaining: number;
  total: number;
  visible: number;
}

export type ReviewCopy = Record<ReviewCopyTextKey, string> & {
  candidateSummary(count: number): string;
  currentPageSummary(count: number): string;
  openInVsCodeLabel(location: string): string;
  progressSummary(summary: ReviewProgressSummary): string;
  remainingSummary(count: number): string;
  translationInputLabel(source: string): string;
};
