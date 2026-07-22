import { describe, expect, it } from 'vitest';
import { createI18nRuntime } from '@ai-i18n/core';
import { html, htmlBridgeCode, transformHtml } from '../src/html';

describe('HTML extractor', () => {
  it('extracts complete text nodes and whitelisted attributes with escaping', () => {
    const source = `<!doctype html>
<html><head><title>t('控制台')</title></head><body>
  <div>普通文本</div>
  <div>t('<保存 &>')</div>
  <input placeholder="t('请输入', '表单')" title="普通" />
  <script type="module">t('脚本不处理')</script>
</body></html>`;
    const result = transformHtml(source, '/workspace/index.html', html());

    expect(result.messages.map((message) => message.id)).toEqual([
      '控制台',
      '<保存 &>',
      '请输入#表单',
    ]);
    expect(result.code).toContain('<title data-ai-i18n-text="');
    expect(result.code).toContain('&lt;保存 &amp;&gt;');
    expect(result.code).toMatch(
      /<input placeholder="请输入" title="普通"\s+data-ai-i18n-attr-placeholder=/,
    );
    expect(result.code).toContain("<script type=\"module\">t('脚本不处理')</script>");
    expect(result.code).toContain('<div>普通文本</div>');
    expect(result.warnings).toEqual([]);
  });

  it('uses comment markers for a text node among sibling nodes', () => {
    const result = transformHtml(
      `<div><span>前缀</span>t('尾部')</div>`,
      '/workspace/index.html',
      html(),
    );

    expect(result.code).toContain('<!--ai-i18n:0-->尾部');
    expect(result.bindings).toMatchObject([
      { kind: 'comment', messageId: '尾部', marker: '0' },
    ]);
  });

  it('renders provided initial translations with HTML escaping', () => {
    const result = transformHtml(
      `<title>t('标题')</title><input title="t('提示')">`,
      '/workspace/index.html',
      html(),
      { 标题: '<Home &>', 提示: 'Say "hi"' },
    );

    expect(result.code).toContain('&lt;Home &amp;&gt;');
    expect(result.code).toContain('title="Say &quot;hi&quot;"');
  });

  it('leaves ordinary, mixed and invalid expressions unchanged', () => {
    const source = `<main>
      <p>前缀 t('不提取')</p>
      <p>t(props.title)</p>
      <input value="t('不在白名单')" />
    </main>`;
    const result = transformHtml(source, '/workspace/index.html', html());

    expect(result.code).toBe(source);
    expect(result.messages).toEqual([]);
    expect(result.warnings).toMatchObject([
      { message: 'HTML t() arguments must be statically evaluable strings' },
    ]);
  });

  it('generates a bridge that registers and updates every binding kind', () => {
    const extracted = transformHtml(
      `<title>t('标题')</title><div><b></b>t('正文')</div><input alt="t('图片')">`,
      '/workspace/index.html',
      html(),
    );
    const code = htmlBridgeCode(
      'index.html',
      {
        'zh-CN': { 标题: '标题', 正文: '正文', 图片: '图片' },
        'en-US': { 标题: null, 正文: null, 图片: null },
      },
      extracted.bindings,
    );

    expect(code).toContain('__registerModule(moduleId');
    expect(code).toContain('__translate(binding.messageId');
    expect(code).toContain('document.createTreeWalker');
    expect(code).toContain('node.setAttribute(binding.attribute, value)');
    expect(code).toContain('__unregisterModule(moduleId)');
  });

  it('applies the Build language and updates HTML bindings after setLang', async () => {
    const extracted = transformHtml(
      `<title>t('标题')</title><input placeholder="t('提示')"><div><b></b>t('正文')</div>`,
      '/workspace/index.html',
      html(),
      { 标题: 'Title', 提示: 'Hint', 正文: 'Body' },
    );
    const bridge = htmlBridgeCode(
      'index.html',
      {
        'zh-CN': { 标题: '标题', 提示: '提示', 正文: '正文' },
        'en-US': { 标题: 'Title', 提示: 'Hint', 正文: 'Body' },
      },
      extracted.bindings,
    );
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    const text = { textContent: '' };
    const attribute = { value: '', setAttribute: (_name: string, value: string) => {
      attribute.value = value;
    } };
    const commentText = { nodeType: 3, nodeValue: '' };
    const commentBinding = extracted.bindings.find((binding) => binding.kind === 'comment')!;
    const comments = [{
      data: `ai-i18n:${commentBinding.marker}`,
      nextSibling: commentText,
    }];
    const document = {
      querySelectorAll(selector: string) {
        if (selector.includes('data-ai-i18n-text')) return [text];
        if (selector.includes('data-ai-i18n-attr-placeholder')) return [attribute];
        return [];
      },
      createTreeWalker() {
        let index = 0;
        return { nextNode: () => comments[index++] ?? null };
      },
    };
    const executable = bridge
      .replace(
        /^import \{[^}]+\} from "virtual:ai-i18n";/m,
        'const { subscribe, __registerModule, __unregisterModule, __translate } = runtime;',
      )
      .replace(/if \(import\.meta\.hot\) \{[\s\S]*\}\s*$/, '');
    const execute = new Function(
      'runtime',
      'document',
      'NodeFilter',
      'Node',
      executable,
    );
    execute(
      {
        subscribe: runtime.subscribe,
        __registerModule: runtime.registerModule,
        __unregisterModule: runtime.unregisterModule,
        __translate: runtime.translate,
      },
      document,
      { SHOW_COMMENT: 128 },
      { TEXT_NODE: 3 },
    );

    expect([text.textContent, attribute.value, commentText.nodeValue]).toEqual([
      'Title',
      'Hint',
      'Body',
    ]);
    await runtime.setLang('zh-CN');
    expect([text.textContent, attribute.value, commentText.nodeValue]).toEqual([
      '标题',
      '提示',
      '正文',
    ]);
  });
});
