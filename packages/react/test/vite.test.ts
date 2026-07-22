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
    const extraction = react().extract(code, '/workspace/src/App.tsx');
    const result = extractMessages(
      analyzeModule(extraction.analysisCode, 'src/App.tsx'),
      undefined,
      extraction.translationHooks,
    );

    expect(extraction.analysisCode).toBe(code);
    expect(result.messages).toMatchObject([
      { id: '标题', source: '标题', locations: [{ line: 5 }] },
    ]);
  });

  it('only opts JSX and TSX files into the shared pipeline', () => {
    const extractor = react();
    expect(extractor.test('/src/App.tsx')).toBe(true);
    expect(extractor.test('/src/App.jsx')).toBe(true);
    expect(extractor.test('/src/plain.ts')).toBe(false);
  });
});
