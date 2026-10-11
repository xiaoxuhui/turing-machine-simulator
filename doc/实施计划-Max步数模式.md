# 实施计划：Max 步数模式

- **Status**: VERIFIED
- **Approved**: 2026-10-12 用户提出 Max 模式
- **Type**: feature

## T1 规划 `[VERIFIED]`

- **Objective**: 定义 Max 的存档语义和作用范围。
- **Definition of Done**: 三份计划文档入库；`git status --short` 无未提交改动。
- **Files**: doc/需求与测试用例-Max步数模式.md, doc/设计文档-Max步数模式.md, doc/实施计划-Max步数模式.md
- **Evidence**: 规划已由 `5e6c15b` 提交，提交后工作区干净。

## T2 项目格式与测试 `[VERIFIED]`

- **Objective**: 项目 JSON 正确保存数字或 Max。
- **Definition of Done**: `node node_modules/vitest/vitest.mjs run src/project-codec.test.ts` 全绿。
- **Files**: src/project-codec.ts, src/project-codec.test.ts
- **Evidence**: 定向 Vitest 10/10 通过，`e09e907` 提交。

## T3 界面与运行 `[VERIFIED]`

- **Objective**: Max 模式可切换，运行中不受阈值中断。
- **Definition of Done**: `node node_modules/typescript/bin/tsc -b`、全量 Vitest 和 Vite 构建通过；浏览器确认切换、运行、暂停和刷新。
- **Files**: src/main.ts, src/styles.css
- **Evidence**: TypeScript、Vite 构建、全量 Vitest 109/109 通过；浏览器验证有限阈值、Max 越界、暂停、刷新与切回有限模式，`12929df` 提交。

## T4 报告与交付 `[VERIFIED]`

- **Objective**: 记录实际验收并更新说明。
- **Definition of Done**: 测试报告列出执行结果；`git diff --check` 通过。
- **Files**: README.md, README.en.md, CHANGELOG.md, doc/测试报告-Max步数模式.md, doc/实施计划-Max步数模式.md
- **Evidence**: 测试报告记录实际输出与交互步骤；`git diff --check` 通过。
