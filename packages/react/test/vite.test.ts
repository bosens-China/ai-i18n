import { describe, expect, it } from 'vitest';
import { analyzeModule, extractMessages } from '@ai-i18n/vite';
import { react } from '../src/vite';

describe('@ai-i18n/react/vite', () => {
  it('extracts hook-bound calls without collecting JSX text or props', () => {
    const code = `import { useI18n as useLocale } from '@ai-i18n/react';
const LABEL = '标题';
export function App() {
  const { t: translate } = useLocale();
  return <main title="普通属性"><h1>{translate(LABEL)}</h1>普通 JSXText</main>;
}`;
    const extractor = react();
    const extraction = extractor.extract(code, '/workspace/src/App.tsx');
    const result = extractMessages(
      analyzeModule(extraction.analysisCode, 'src/App.tsx'),
      undefined,
      extractor.translationHooks,
    );

    expect(extraction.analysisCode).toBe(code);
    expect(result.messages).toMatchObject([
      { id: '标题', source: '标题', locations: [{ line: 5 }] },
    ]);
  });

  it('exposes Hook semantics to plain TypeScript and supports member calls', () => {
    const extractor = react();
    const code = `import { useI18n } from '@ai-i18n/react';
export function useLabels() {
  const i18n = useI18n();
  const direct = i18n.t('普通 TS Hook');
  return [direct, i18n['t']('computed member')];
}`;
    const result = extractMessages(
      analyzeModule(code, 'src/useLabels.ts'),
      undefined,
      extractor.translationHooks,
    );

    expect(extractor.test('/src/useLabels.ts')).toBe(false);
    expect(result.messages).toMatchObject([
      { id: '普通 TS Hook', source: '普通 TS Hook', locations: [{ line: 4 }] },
      {
        id: 'computed member',
        source: 'computed member',
        locations: [{ line: 5 }],
      },
    ]);
  });

  it('only opts JSX and TSX files into the shared pipeline', () => {
    const extractor = react();
    expect(extractor.test('/src/App.tsx')).toBe(true);
    expect(extractor.test('/src/App.jsx')).toBe(true);
    expect(extractor.test('/src/plain.ts')).toBe(false);
  });
});
