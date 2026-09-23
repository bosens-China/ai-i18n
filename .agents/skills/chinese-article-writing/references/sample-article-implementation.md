# 探索现代化 i18n 方案：实现与体验

## 7. 插件实现要点（Vite Plugin）

插件的核心职责可以归纳为两点：

1. **收集需要翻译的文案**
2. **在合适的时机批量调用 LLM，并持久化结果到单文件 JSON**

关键实现细节包括：

- 翻译队列与批处理机制
- 本地缓存与持久化
- 避免重复翻译已存在 Key

```ts
/**
 * vite-plugin-ai-i18n.ts
 *
 * 说明：
 * 这是一个用于解释 AI i18n 插件核心流程的伪代码示例。
 * 重点在于架构、数据流和设计思路，而非具体 API 或可运行实现。
 */

import fs from "fs";
import path from "path";

// -------------------------
// 虚拟模块定义
// -------------------------
const VIRTUAL_MODULE_ID = "virtual:ai-i18n";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

// -------------------------
// 输出文件与默认语言
// -------------------------
const LOCALES_DIR = path.resolve(process.cwd(), "locales");
const LOCALE_FILE = path.join(LOCALES_DIR, "i18n.json");
const DEFAULT_LANG = "english";

// -------------------------
// 类型定义（简化）
// -------------------------
type Lang = string;
type TranslationKey = string;

interface PendingItem {
  key: TranslationKey; // 唯一标识：原文#上下文
  text: string; // 原文
  context?: string; // 可选上下文信息
}

type LangMessages = Record<Lang, string>;
type AllMessages = Record<TranslationKey, LangMessages>;

// -------------------------
// 工具函数（伪实现）
// -------------------------

/**
 * 读取已有 JSON 语言包
 * 如果文件不存在，返回空对象
 */
function loadLocales(): AllMessages {
  if (!fs.existsSync(LOCALE_FILE)) return {};
  return JSON.parse(fs.readFileSync(LOCALE_FILE, "utf-8"));
}

/**
 * 将最终语言包写入本地 JSON
 * 自动创建目录
 */
function saveLocales(messages: AllMessages) {
  if (!fs.existsSync(LOCALES_DIR)) fs.mkdirSync(LOCALES_DIR);
  fs.writeFileSync(LOCALE_FILE, JSON.stringify(messages, null, 2));
}

/**
 * 扫描源码中所有 t(...) / t`...` 的调用
 * 实际实现应使用 AST
 */
function scanForI18nTexts(code: string): PendingItem[] {
  // 伪逻辑示意：
  // 1. 遍历代码 AST
  // 2. 找到 t`xxx` 或 t('xxx', 'context')
  // 3. 返回 PendingItem 列表
  return [];
}

// -------------------------
// 插件主逻辑
// -------------------------
export default function aiI18nPlugin(options: {
  targetLangs?: Lang[]; // 目标语言列表
  defaultLang?: Lang; // 默认语言
}) {
  const defaultLang = options.defaultLang || DEFAULT_LANG;
  const targetLangs = options.targetLangs || [defaultLang];

  // 加载已有翻译（人工可校准）
  const allMessages: AllMessages = loadLocales();

  // 待翻译队列，只收集尚未存在的 Key
  const pendingQueue: Map<string, PendingItem> = new Map();

  return {
    name: "vite-plugin-ai-i18n",

    // -------------------------
    // 虚拟模块解析
    // -------------------------
    resolveId(id: string) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
    },

    // -------------------------
    // 虚拟模块加载
    // -------------------------
    load(id: string) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        // 这里返回运行时代码：
        // - messages: 当前语言包
        // - t: 翻译函数
        // - setLang/getCurrentLang: 语言切换函数
        return `
          const messages = ${JSON.stringify(allMessages)};
          let currentLang = '${defaultLang}';

          export function t(text, context = '') {
            const key = context ? \`\${text}#\${context}\` : text;
            return messages[key]?.[currentLang] || text;
          }

          export function setLang(lang) { currentLang = lang; }
          export function getCurrentLang() { return currentLang; }
        `;
      }
    },

    // -------------------------
    // 源码扫描阶段
    // -------------------------
    transform(code: string, id: string) {
      // 忽略 node_modules
      if (id.includes("node_modules")) return;

      // 扫描源码，收集 t(...) / t`...` 调用
      const foundItems = scanForI18nTexts(code);

      for (const item of foundItems) {
        // key = 原文 + 可选上下文
        const key = item.context ? `${item.text}#${item.context}` : item.text;

        // 针对每个目标语言，判断是否已存在翻译
        for (const lang of targetLangs) {
          const langMessages = allMessages[key] || {};
          if (!langMessages[lang]) {
            // 尚未存在翻译，加入待翻译队列
            pendingQueue.set(`${lang}:${key}`, { ...item, key });
          }
        }
      }

      // 返回原始代码，不修改
      return code;
    },

    // -------------------------
    // 构建结束 / 批量翻译
    // -------------------------
    async buildEnd() {
      if (!pendingQueue.size) return;

      // 按语言分组
      const groupedByLang: Record<Lang, PendingItem[]> = {};
      for (const [compoundKey, item] of pendingQueue) {
        const [lang] = compoundKey.split(":");
        groupedByLang[lang] ||= [];
        groupedByLang[lang].push(item);
      }

      // 对每个目标语言调用 LLM 翻译（伪逻辑）
      for (const lang in groupedByLang) {
        const items = groupedByLang[lang];

        // === 这里可以调用 LLM API ===
        // const results = await llm.translateBatch(items)

        // 伪结果示例
        const results: { key: string; value: string }[] = [];

        // 将翻译结果写入内存缓存
        for (const { key, value } of results) {
          allMessages[key] ||= {};
          allMessages[key][lang] = value;
        }
      }

      // 持久化到单 JSON 文件，人工可校准
      saveLocales(allMessages);

      // 清空队列，避免重复翻译
      pendingQueue.clear();
    },
  };
}
```

## 8. 实际使用体验

封装后，开发侧使用方式非常简单：

```vue
<div>{{ t`你好` }}</div>
<button>{{ t('提交', '表单操作') }}</button>
```

切换语言：

```ts
setLang("english");
```

扩展新语言（如日文、法文、韩文）时，只需调整插件配置中的 `targetLangs`，**无需额外维护 Key 或复制文案文件**。

## 9. 总结

这套 i18n 方案的核心价值不在于“AI 翻译”本身，而在于：

1. **文案回归自然语言，而不是 Key**
2. **翻译与维护成本前移到工具链**
3. **通过上下文 + LLM 提升翻译质量**
4. **单 JSON 文件 + 虚拟模块 + 增量翻译降低多语言长期成本**
5. **支持人工校准，只处理未翻译 Key，安全可靠**

目前这仍是一个持续演进中的实践方案，但在复杂业务、多语言项目中，已经展现出明显的工程价值。

如果你对 i18n、工程自动化或 AI 在前端工具链中的应用有不同看法，欢迎一起交流和探讨。
