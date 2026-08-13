import { defineConfig, presetIcons, presetUno } from 'unocss';

export default defineConfig({
  presets: [presetUno(), presetIcons()],
  theme: {
    colors: {
      bgBase: '#0b0f19',
      bgSurface: '#111827',
      bgOverlay: '#1f293d',
      bgWash: '#162032',
      bgWashHover: '#1e2c45',
      ink: '#f3f4f6',
      muted: '#9ca3af',
      dimmed: '#6b7280',
      line: '#1e293b',
      lineFocus: '#334155',
      accent: '#3b82f6',
      accentDark: '#1d4ed8',
      cyan: '#06b6d4',
      statusGreen: '#34d399',
      statusGreenBg: '#064e3b',
      statusAmber: '#fbbf24',
      statusAmberBg: '#451a03',
      statusRed: '#f87171',
      statusRedBg: '#4c0519',
    },
  },
  shortcuts: {
    'btn-primary':
      'appearance-none h-8 px-3.5 py-0 rounded-lg border border-transparent bg-accent text-white font-bold text-xs hover:bg-accentDark transition disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bgSurface',
    'btn-quiet':
      'appearance-none h-8 px-3.5 py-0 rounded-lg bg-bgWash text-statusRed border border-line text-xs font-bold hover:bg-statusRedBg hover:border-statusRed transition disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-statusRed focus-visible:ring-offset-2 focus-visible:ring-offset-bgSurface',
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
