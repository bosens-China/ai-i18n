/** 示例只共享视觉约定，各框架保留自己的组件和翻译调用。 */
export const demoTheme = {
  theme: {
    colors: {
      ink: '#17243b',
      muted: '#64748b',
      accent: '#245d73',
      canvas: '#f7f9fc',
      line: '#dce4ed',
      wash: '#e9f1f7',
    },
  },
  shortcuts: {
    'demo-shell': 'mx-auto max-w-6xl px-5 sm:px-8 lg:px-12',
    'demo-header':
      'flex flex-wrap items-center justify-between gap-5 border-b border-line py-6',
    'demo-brand': 'inline-flex items-center gap-3 text-ink no-underline',
    'demo-brand-mark':
      'grid h-10 w-10 place-items-center rounded-xl bg-ink text-lg text-white font-semibold',
    'demo-nav': 'flex flex-wrap items-center gap-5 text-sm text-muted',
    'demo-kicker':
      'text-xs font-semibold tracking-widest uppercase text-accent',
    'demo-heading':
      'm-0 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight text-ink',
    'demo-intro': 'max-w-xl text-base sm:text-lg leading-relaxed text-muted',
    'demo-select':
      'min-h-11 max-w-full rounded-lg border border-line bg-white pl-3 pr-10 py-2 text-sm text-ink',
    'demo-button':
      'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-medium text-white no-underline',
    'demo-link':
      'inline-flex items-center gap-2 text-sm font-medium text-accent underline-offset-4 hover:underline',
    'demo-tag':
      'inline-flex rounded-full bg-wash px-3 py-1 text-xs font-medium text-accent',
    'demo-card': 'min-w-0 rounded-2xl border border-line bg-white p-6 sm:p-8',
    'demo-grid': 'grid grid-cols-1 gap-5 md:grid-cols-3',
    'demo-section-heading':
      'm-0 text-2xl font-semibold tracking-tight text-ink',
    'demo-footer':
      'mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-line py-7 text-xs text-muted',
  },
};
