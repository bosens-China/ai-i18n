# @ai-i18n/vite

Vite 8+ 浏览器应用的文案提取与翻译插件。最低 Node.js 版本为 **22.13.0**；仓库本地提取索引使用内置 `node:sqlite`。

```ts
// ai-i18n.config.ts
import { defineConfig } from '@ai-i18n/vite/config';

export default defineConfig({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
});
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { aiI18n } from '@ai-i18n/vite';

export default defineConfig({ plugins: [aiI18n()] });
```

```ts
import { t } from 'virtual:ai-i18n';

t('保存'); // 全局
t('保存', { comment: '按钮' }); // 独立的全局语境
t('保存', { scope: 'file' }); // 当前文件，缺译回退到同语境的全局译文
t('保存', { scope: 'file', comment: '按钮' });
```

`comment` 只区分翻译身份；含 comment 的文案不会回退到不含 comment 的译文。缺译显示原文。文件范围仅在显式指定 `scope: 'file'` 时启用。

## 翻译输入

Build 和显式 MCP 扫描提取完整文案。可选 `adapter` 接收本轮完整目录，返回按语言和 key 索引的译文；返回 `null` 表示不处理。它只在本轮生效，插件不缓存其返回值。

```ts
export default defineConfig({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
  async adapter(catalog) {
    const result = await translateWithYourService(catalog);
    return result; // { 'en-US': { [catalog.messages[0].key]: '...' } } 或 null
  },
});
```

人工译文保存在 `i18n/locales/en-US.manual.json`（全局）或 `i18n/locales/files/en-US.manual.json`（文件）。人工值优先于适配器。生成的 `i18n/locales/en-US.json` 以及 `i18n/locales/files/en-US/<group>.json` 是可提交的最终 key→value 资源，不能作为人工输入编辑。文件包按构建模块合并并按需加载。提取索引位于仓库根的 `node_modules/.cache/ai-i18n/extracted.sqlite`，不提交 Git。

Dev 只加载已有资源并转换页面代码，不调用适配器，也不写提取索引。编辑人工文件后运行 Build 或 MCP 扫描刷新最终资源。可设置 `failOnMissingTranslations: true` 让缺译阻止 Build。

旧 `provider`、`remote`、`translationMemory`、`cleanup` 配置已移除；旧人工 `overrides/` 会在可无损转换的完整构建或扫描中迁移，遇到歧义会报错并保留旧文件。

完整接入与资源规则见[用户文档](https://bosens-china.github.io/ai-i18n/guide/basic/directory)。
