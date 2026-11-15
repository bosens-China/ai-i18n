import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';

// Exercise the same bundled workbench that the host loads, including its DOM events.
it.each([false, true])(
  'saves a located message with file scope available: %s',
  async (fileScoped) => {
    const browser = new Window({ url: 'http://localhost/' });
    for (const name of [
      'window',
      'document',
      'navigator',
      'Node',
      'Element',
      'HTMLElement',
      'SVGElement',
      'MutationObserver',
      'localStorage',
      'getComputedStyle',
    ] as const) {
      vi.stubGlobal(name, name === 'window' ? browser : browser[name]);
    }
    const messages = ['保存', '关闭'].map((source, index) => ({
      message: { source },
      translations: { 'en-US': null },
      overrides: [],
      occurrences: [
        {
          sourceFile: 'src/page.ts',
          fileScoped,
          locations: [{ line: index + 1, column: 0 }],
        },
      ],
    }));
    const snapshot = {
      sourceLang: 'zh-CN',
      locales: [{ value: 'en-US', label: 'English' }],
      messages,
    };
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () =>
        options?.method === 'POST' ? { changed: true } : snapshot,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { mountReviewWorkbench } = await import('../dist/review-ui.js');
    const container = browser.document.createElement('div');
    browser.document.body.append(container);
    const controller = mountReviewWorkbench(container, { mode: 'embedded' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.setSelection({
      candidateKeys: messages.map(({ message }) =>
        JSON.stringify([message.source, null]),
      ),
    });
    await vi.waitFor(() =>
      expect(container.querySelectorAll('.locate-entry')).toHaveLength(2),
    );
    (
      container.querySelector('.locate-entry') as unknown as HTMLElement
    ).click();
    await vi.waitFor(() =>
      expect(container.querySelector('textarea')).not.toBeNull(),
    );
    const input = container.querySelector('textarea')!;
    input.value = 'Save';
    input.dispatchEvent(new browser.Event('input', { bubbles: true }));
    const save = container.querySelector(
      '.review-editor-card .btn-primary',
    ) as unknown as HTMLButtonElement;
    await vi.waitFor(() => expect(save.disabled).toBe(false));
    save.click();
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/__ai-i18n/api/overrides',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = fetchMock.mock.calls.find(
      ([, options]) => options?.method === 'POST',
    )!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({
      message: { source: '保存' },
      locale: 'en-US',
      ...(fileScoped ? { file: 'src/page.ts' } : {}),
      value: 'Save',
    });
    controller.destroy();
    await browser.happyDOM.close();
  },
);

afterEach(() => vi.unstubAllGlobals());
