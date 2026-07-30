---
title: React useI18n()
description: 在 React 组件中订阅 Runtime，并响应语言和语言包状态变化
---

React 模式从 `virtual:ai-i18n` 导出 `useI18n()`：

```ts
import { useI18n } from 'virtual:ai-i18n';
```

## 签名

```ts
interface ReactI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: string;
  langs: readonly LangOption[];
  langLoadState: LangLoadState;
  isLangLoading: boolean;
  langLoadError: unknown | null;
}

type UseI18n = () => ReactI18n;
```

`useI18n()` 没有参数。

## 返回值

| 字段            | 类型                     | 作用                       |
| --------------- | ------------------------ | -------------------------- |
| `t`             | `I18nRuntime['t']`       | 翻译文案                   |
| `setLang`       | `I18nRuntime['setLang']` | 切换语言                   |
| `currentLang`   | `string`                 | 当前语言                   |
| `langs`         | `readonly LangOption[]`  | 支持的语言列表             |
| `langLoadState` | `LangLoadState`          | 完整加载状态快照           |
| `isLangLoading` | `boolean`                | 是否正在加载目标语言       |
| `langLoadError` | `unknown \| null`        | 最近一次有效切换的加载错误 |

`langLoadError` 保留 loader reject 的原始值，因此类型是 `unknown`，也可能是
`undefined`、`null`、空字符串等 falsy 值。判断是否失败必须使用
`langLoadState.status === 'error'`。`langLoadError` 只用于读取详情，展示前应转换为应用
自己的用户文案。下一次有效切换开始或加载成功后会清除它。完整三态见
[`getLangLoadState()`](/api/runtime/functions/get-lang-load-state)。

## 解构或改名 `t`

React 可以直接解构或改名 `t`。分析器会识别这个绑定，并按顶层 `t()` 相同的规则提取
普通文本、静态变量、条件表达式、tagged template 和静态文案树：

```tsx
const { t: translate } = useI18n();

const title = translate('订单详情');
const labels = translate({ save: '保存', cancel: '取消' });
```

这里的 `translate` 仍然来自 Hook。解构或改名只改变本地变量名，不会把它降级为无订阅的
Runtime 顶层 `t`。

## 示例

```tsx
import { useI18n } from 'virtual:ai-i18n';

export function LanguagePicker() {
  const { isLangLoading, langLoadState, setLang, t } = useI18n();
  const labels = t({
    loading: '正在加载语言包…',
    switchLanguage: '切换语言',
  });

  async function switchLanguage() {
    try {
      await setLang('en-US');
    } catch {
      // 通用错误 UI 读取共享状态；这里终结 rejected Promise。
    }
  }

  return (
    <>
      <button disabled={isLangLoading} onClick={() => void switchLanguage()}>
        {isLangLoading ? labels.loading : labels.switchLanguage}
      </button>
      {langLoadState.status === 'error' ? (
        <p>{t('语言包加载失败，请重试')}</p>
      ) : null}
    </>
  );
}
```

React 中必须遵守 Hook 调用规则。

React 适配器使用 `useSyncExternalStore` 订阅 Runtime revision。revision 改变时，Hook
返回的 `t` 也会获得新的函数引用，因此 React Compiler 可以使依赖该引用的缓存失效。直接
导入 Runtime 顶层 `t` 没有这个订阅边界；`"use memo"` 或 `"use no memo"` 都不能替代
`useI18n()`。

文案写法见 [React 文案写法](/guide/basic/static-analysis/react)。
