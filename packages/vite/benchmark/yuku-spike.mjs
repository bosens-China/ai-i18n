import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { analyze, Analyzer } from 'yuku-analyzer';

const traverse = traverseModule.default ?? traverseModule;
const iterations = 200;
const buildIterations = 10;
const moduleCount = 200;
const source = `
  import { t as translate } from 'virtual:ai-i18n';
  const labels = Array.from({ length: 100 }, (_, index) => 'label-' + index);
  export function render(value: number) {
    return translate(value > 0 ? 'positive' : 'negative', 'result') + labels[value];
  }
`;

function measure(run, count = iterations) {
  for (let index = 0; index < 10; index += 1) run(index);
  const start = performance.now();
  for (let index = 0; index < count; index += 1) run(index);
  return Number((performance.now() - start).toFixed(2));
}

const buildSources = Array.from({ length: moduleCount }, (_, index) => ({
  id: `module-${index}.ts`,
  code: `${source}\nexport const message${index} = translate('message-${index}');`,
}));

const babelMs = measure(() => {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  traverse(ast, { CallExpression() {} });
});
const yukuColdMs = measure(() => {
  const module = analyze(source, { path: 'fixture.ts' });
  module.walk({ CallExpression() {} });
});
const analyzer = new Analyzer();
const yukuReplaceMs = measure((index) => {
  const module = analyzer.addFile('fixture.ts', `${source}\n// ${index}`);
  module.walk({ CallExpression() {} });
});
const babelBuildMs = measure(() => {
  for (const fixture of buildSources) {
    const ast = parse(fixture.code, {
      sourceType: 'module',
      plugins: ['typescript'],
    });
    traverse(ast, { CallExpression() {} });
  }
}, buildIterations);
const yukuBuildMs = measure(() => {
  const buildAnalyzer = new Analyzer();
  for (const fixture of buildSources) {
    buildAnalyzer.addFile(fixture.id, fixture.code);
  }
  buildAnalyzer.link();
  for (const module of buildAnalyzer.modules.values()) {
    module.walk({ CallExpression() {} });
  }
}, buildIterations);

console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      iterations,
      buildIterations,
      moduleCount,
      babelParseTraverseMs: babelMs,
      yukuAnalyzeWalkMs: yukuColdMs,
      yukuReplaceWalkMs: yukuReplaceMs,
      babelBuildGraphMs: babelBuildMs,
      yukuBuildGraphMs: yukuBuildMs,
    },
    null,
    2,
  ),
);
