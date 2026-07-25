# Phase 6 验收

状态：Passed。

## 自动化验收

- Analyzer：宏集合、嵌套数组、动态索引、静态 spread、宽松提取与严格诊断。
- Vite：普通 TS、Vue `<script setup>`、SSR、本地同名遮蔽、非法运行时引用与生成声明。
- Vitest：测试 transform 消除宏，不要求 Runtime 导入。
- ESLint：推荐写法通过；拼接、逻辑、`let`、普通成员、错误宏声明和非推荐调用来源报错。

## 验收结果

- `pnpm build`：通过；所有发布包构建、publint 与 arethetypeswrong 检查通过。
- `pnpm test`：通过；27 个测试文件、213 个测试用例全部通过。
- `pnpm check`：通过；根配置、Docs、所有包与 Vue / React / Vanilla 示例的 TypeScript
  和 ESLint 检查通过。
- `git diff --check`：通过。
