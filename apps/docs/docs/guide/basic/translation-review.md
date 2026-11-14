---
title: 翻译校对
description: 在 Vite Dev 中查看文案并保存人工译文
---

校对工作台是可选的 Dev 插件。在现有 Vite 插件列表中注册：

```ts
import { aiI18n } from '@ai-i18n/vite';
import { aiI18nReview } from '@ai-i18n/vite/review';

export default defineConfig({
  plugins: [aiI18n(), aiI18nReview()],
});
```

业务页面右下角会显示入口；也可以打开 Dev 控制台打印的 `/__ai-i18n/` 地址。工作台能查看当前页或完整扫描后的文案，显示原文、comment、出现文件、当前生成的译文和人工值。

人工值只能保存为**全局**或**显式文件范围**。选择文件范围时，源码调用必须写 `t('文案', { scope: 'file' })`；单个行列位置范围已移除。comment 仅区分翻译身份，不改变范围。保存写入 `i18n/locales/*.manual.json`，删除只清除对应人工值。

Review 的保存不会在 Dev 中调用翻译适配器或重建资源。保存后运行完整 Build 或让 Agent 显式扫描，业务页面才会读取更新的最终资源。批量补译建议使用 [Agent + MCP](/ai/ai-tools)。

`aiI18nReview({ launcher: false })` 隐藏业务页面入口；`printUrl: false` 不打印地址。两者都不会关闭工作台服务。移除 Review 插件即可关闭入口和服务；它不会进入生产构建。
