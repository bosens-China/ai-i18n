import { describe, expect, it, vi } from 'vitest';

vi.mock('picocolors', () => ({
  default: {
    bold: (value: string) => `<bold>${value}</bold>`,
    cyan: (value: string) => `<cyan>${value}</cyan>`,
    dim: (value: string) => `<dim>${value}</dim>`,
    red: (value: string) => `<red>${value}</red>`,
    yellow: (value: string) => `<yellow>${value}</yellow>`,
  },
}));

import {
  formatTerminalDiagnostic,
  formatTimingDuration,
  formatTimingModule,
  formatTimingStage,
} from '../src/terminal-format';

describe('Vite terminal formatting', () => {
  it.each([
    ['info', '<cyan><bold>[ai-i18n]</bold></cyan>'],
    ['warning', '<yellow><bold>[ai-i18n]</bold></yellow>'],
    ['error', '<red><bold>[ai-i18n]</bold></red>'],
    ['timing', '<dim><bold>[ai-i18n:timing]</bold></dim>'],
  ] as const)(
    'styles the %s prefix without coloring the body',
    (tone, prefix) => {
      const namespace = tone === 'timing' ? '[ai-i18n:timing]' : '[ai-i18n]';
      expect(formatTerminalDiagnostic(`${namespace} message`, tone)).toBe(
        `${prefix} message`,
      );
    },
  );

  it('leaves messages without an ai-i18n prefix unchanged', () => {
    expect(formatTerminalDiagnostic('plain message', 'warning')).toBe(
      'plain message',
    );
  });

  it('uses restrained emphasis for timing fields', () => {
    expect(formatTimingStage('file-sync')).toBe('<cyan>file-sync</cyan>');
    expect(formatTimingDuration('12.50ms')).toBe('<yellow>12.50ms</yellow>');
    expect(formatTimingModule('"src/main.ts"')).toBe(
      '<dim>"src/main.ts"</dim>',
    );
  });
});
