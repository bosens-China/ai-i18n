import colors from 'picocolors';

export type TerminalDiagnosticTone = 'info' | 'warning' | 'error' | 'timing';

const AI_I18N_PREFIX = /^\[ai-i18n(?::[a-z-]+)?\]/;

export function formatTerminalDiagnostic(
  message: string,
  tone: TerminalDiagnosticTone,
): string {
  return message.replace(AI_I18N_PREFIX, (prefix) => stylePrefix(prefix, tone));
}

export function formatTimingStage(stage: string): string {
  return colors.cyan(stage);
}

export function formatTimingDuration(duration: string): string {
  return colors.yellow(duration);
}

export function formatTimingModule(moduleId: string): string {
  return colors.dim(moduleId);
}

function stylePrefix(prefix: string, tone: TerminalDiagnosticTone): string {
  const bold = colors.bold(prefix);
  switch (tone) {
    case 'warning':
      return colors.yellow(bold);
    case 'error':
      return colors.red(bold);
    case 'timing':
      return colors.dim(bold);
    default:
      return colors.cyan(bold);
  }
}
