# @ai-i18n/analyzer

ai-i18n 内部使用的 Yuku 静态分析内核。它统一维护翻译 binding、Hook、静态字符串参数和
诊断语义，供 Vite 提取器与 ESLint 插件共同消费。分析器可枚举静态对象、数组、spread、
成员访问与有限动态索引，并单独输出推荐语法诊断；它不会执行用户函数或 getter。

业务项目通常不需要直接安装或调用这个包。

## Vue 分析的自动导入成本

`analyzeVueSource(source, id, compiler, { autoImport: false })` 可跳过为自动导入作用域
单独生成的分析代码；消息分析和源码位置映射继续完整执行。第四个参数省略时保留完整自动导入
分析，兼容既有调用方。消费 `autoImportCode` 的调用方不得关闭该选项。
Vite 插件根据自身 `autoImport` 配置传入此选项，应用无需增加配置。
