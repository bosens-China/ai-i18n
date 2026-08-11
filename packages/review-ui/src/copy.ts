const zh = {
  eyebrow: 'ai-i18n · 开发环境',
  title: '翻译校对',
  description: '比较自动译文与人工定稿。保存后，当前开发页面会立即更新。',
  search: '搜索原文、语境或文件…',
  all: '全部',
  unreviewed: '待校对',
  reviewed: '已定稿',
  showing: '显示',
  of: '/ 共',
  messages: '条文案',
  source: '原文',
  context: '语境',
  machine: '自动译文',
  noMachine: '尚无自动译文，将回退原文',
  final: '人工定稿',
  scope: '作用范围',
  global: '当前应用的所有位置',
  save: '保存人工译文',
  remove: '撤销此范围的定稿',
  occurrences: '处引用',
  noResults: '没有符合当前筛选条件的文案。',
  noMessages: '还没有提取到文案。请先在浏览器中打开需要校对的业务页面。',
  saved: '人工译文已保存。',
  removed: '人工译文已撤销。',
  failed: '无法读取校对数据。',
} as const;

const en: ReviewCopy = {
  eyebrow: 'ai-i18n · local proof',
  title: 'Translation review',
  description:
    'Compare machine copy with the human decision. The active development page updates after saving.',
  search: 'Search source, context, or file…',
  all: 'All',
  unreviewed: 'Needs review',
  reviewed: 'Reviewed',
  showing: 'Showing',
  of: 'of',
  messages: 'messages',
  source: 'Source',
  context: 'Context',
  machine: 'Automatic',
  noMachine: 'No automatic translation; source fallback is active',
  final: 'Human decision',
  scope: 'Scope',
  global: 'Every occurrence in this application',
  save: 'Save reviewed translation',
  remove: 'Remove decision for this scope',
  occurrences: 'occurrences',
  noResults: 'No messages match the current filters.',
  noMessages:
    'No messages have been extracted yet. Open the application pages you want to review first.',
  saved: 'Reviewed translation saved.',
  removed: 'Reviewed translation removed.',
  failed: 'The review data could not be loaded.',
};

export type ReviewCopy = { [Key in keyof typeof zh]: string };

export function reviewCopy(): ReviewCopy {
  const chinese = navigator.language.toLowerCase().startsWith('zh');
  document.documentElement.lang = chinese ? 'zh-CN' : 'en';
  return chinese ? zh : en;
}
