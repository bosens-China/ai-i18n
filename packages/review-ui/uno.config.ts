import { defineConfig, presetIcons, presetUno } from 'unocss';

export default defineConfig({
  presets: [presetIcons(), presetUno()],
  theme: {
    colors: {
      bgBase: 'var(--_review-bg-base)',
      bgSurface: 'var(--_review-bg-surface)',
      bgOverlay: 'var(--_review-bg-overlay)',
      bgWash: 'var(--_review-bg-subtle)',
      bgWashHover: 'var(--_review-bg-subtle-hover)',
      ink: 'var(--_review-text)',
      muted: 'var(--_review-text-muted)',
      dimmed: 'var(--_review-text-subtle)',
      line: 'var(--_review-border)',
      lineFocus: 'var(--_review-border-strong)',
      accent: 'var(--_review-accent)',
      accentSurface: 'var(--_review-accent-surface)',
      accentSurfaceHover: 'var(--_review-accent-surface-hover)',
      accentSoft: 'var(--_review-accent-soft)',
      onAccent: 'var(--_review-on-accent)',
      accentSecondary: 'var(--_review-accent-secondary)',
      statusGreen: 'var(--_review-success)',
      statusGreenBg: 'var(--_review-success-soft)',
      statusAmber: 'var(--_review-warning)',
      statusAmberBg: 'var(--_review-warning-soft)',
      statusRed: 'var(--_review-danger)',
      statusRedBg: 'var(--_review-danger-soft)',
    },
  },
  shortcuts: {
    'btn-primary':
      'appearance-none px-3.5 py-0 border font-bold text-xs transition disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bgSurface',
    'btn-quiet':
      'appearance-none px-3.5 py-0 border text-xs font-bold transition disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-statusRed focus-visible:ring-offset-2 focus-visible:ring-offset-bgSurface',
    'btn-icon':
      'appearance-none grid place-items-center p-0 border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bgSurface',
    'review-tab':
      'appearance-none relative h-9 px-3.5 border-0 border-b-2 border-b-transparent bg-transparent text-muted text-xs leading-none font-semibold cursor-pointer transition-colors duration-160 hover:text-ink aria-selected:text-ink aria-selected:border-b-accent',
    'locale-option':
      'appearance-none flex-none w-10 p-0 border font-mono text-[10px] leading-none font-bold cursor-pointer transition-colors duration-160',
    'segment-option':
      'appearance-none px-2.5 border-0 text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
    'filter-segment': 'segment-option shrink-0',
    'scope-segment':
      'segment-option min-w-[88px] text-center truncate aria-pressed:shadow-sm',
    'badge-reviewed':
      'px-2 py-0.5 rounded-full text-[10px] font-bold text-statusGreen bg-statusGreenBg border border-statusGreen/25',
    'badge-unreviewed':
      'px-2 py-0.5 rounded-full text-[10px] font-bold text-statusAmber bg-statusAmberBg border border-statusAmber/25',
    'badge-dirty':
      'px-2 py-0.5 rounded-full text-[10px] text-statusAmber bg-statusAmberBg border border-statusAmber/30',
  },
});
