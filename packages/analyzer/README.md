# @boses/analyzer

ai-i18n 内部使用的 Yuku 静态分析内核。它统一维护翻译 binding、Hook、静态字符串参数和
诊断语义，供 Vite 提取器与 ESLint 插件共同消费。

业务项目通常不需要直接安装或调用这个包。
