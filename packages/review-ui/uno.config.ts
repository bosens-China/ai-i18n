import { defineConfig, presetIcons, presetUno } from 'unocss';

export default defineConfig({
  presets: [presetIcons(), presetUno()],
  theme: {
    colors: {
      bgBase: 'var(--review-bg-base)',
      bgSurface: 'var(--review-bg-surface)',
      bgOverlay: 'var(--review-bg-overlay)',
      bgWash: 'var(--review-bg-wash)',
      bgWashHover: 'var(--review-bg-wash-hover)',
      ink: 'var(--review-ink)',
      muted: 'var(--review-muted)',
      dimmed: 'var(--review-dimmed)',
      line: 'var(--review-line)',
      lineFocus: 'var(--review-line-focus)',
      accent: 'var(--review-accent)',
      accentDark: 'var(--review-accent-dark)',
      accentSoft: 'var(--review-accent-soft)',
      cyan: 'var(--review-cyan)',
      statusGreen: 'var(--review-status-green)',
      statusGreenBg: 'var(--review-status-green-bg)',
      statusAmber: 'var(--review-status-amber)',
      statusAmberBg: 'var(--review-status-amber-bg)',
      statusRed: 'var(--review-status-red)',
      statusRedBg: 'var(--review-status-red-bg)',
    },
  },
  shortcuts: {
    'btn-primary':
      'appearance-none h-8 px-3.5 py-0 rounded-lg border border-transparent bg-accent text-white font-bold text-xs hover:bg-accentDark transition disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bgSurface',
    'btn-quiet':
      'appearance-none h-8 px-3.5 py-0 rounded-lg bg-bgWash text-statusRed border border-line text-xs font-bold hover:bg-statusRedBg hover:border-statusRed transition disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-statusRed focus-visible:ring-offset-2 focus-visible:ring-offset-bgSurface',
    'btn-icon':
      'appearance-none grid place-items-center w-8 h-8 p-0 rounded-lg border border-line bg-bgWash text-muted hover:text-ink hover:bg-bgWashHover hover:border-lineFocus transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bgSurface',
    'review-tab':
      'appearance-none relative h-9 px-3.5 border-0 border-b-2 border-b-transparent bg-transparent text-muted text-xs leading-none font-semibold cursor-pointer transition-colors duration-160 hover:text-ink aria-selected:text-ink aria-selected:border-b-accent',
    'locale-option':
      'appearance-none flex-none w-10 h-7 p-0 border border-transparent rounded-[7px] bg-transparent text-muted font-mono text-[10px] leading-none font-bold cursor-pointer transition-colors duration-160 hover:text-ink hover:bg-bgWashHover',
    'segment-option':
      'appearance-none h-7 px-2.5 border-0 rounded-md bg-transparent text-xs font-semibold text-muted cursor-pointer hover:text-ink hover:bg-bgWashHover transition-colors aria-pressed:bg-accent aria-pressed:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
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
