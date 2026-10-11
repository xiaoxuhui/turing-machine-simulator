# 实施计划：Max 步数模式

- **Status**: COMPLETE
- **Approved**: 2026-10-12 用户提出 Max 模式
- **Type**: feature

## T1 规划 `[COMPLETE]`

- **Objective**: 定义 Max 的存档语义和作用范围。
- **Definition of Done**: 三份计划文档入库；`git status --short` 无未提交改动。
- **Files**: doc/需求与测试用例-Max步数模式.md, doc/设计文档-Max步数模式.md, doc/实施计划-Max步数模式.md

## T2 项目格式与测试 `[COMPLETE]`

- **Objective**: 项目 JSON 正确保存数字或 Max。
- **Definition of Done**: `node node_modules/vitest/vitest.mjs run src/project-codec.test.ts` 全绿。
- **Files**: src/project-codec.ts, src/project-codec.test.ts

## T3 界面与运行 `[COMPLETE]`

- **Objective**: Max 模式可切换，运行中不受阈值中断。
- **Definition of Done**: `node node_modules/typescript/bin/tsc -b`、全量 Vitest 和 Vite 构建通过；浏览器确认切换、运行、暂停和刷新。
- **Files**: src/main.ts, src/styles.css

## T4 报告与交付 `[PENDING]`

- **Objective**: 记录实际验收并更新说明。
- **Definition of Done**: 测试报告列出执行结果；`git diff --check` 通过。
- **Files**: README.md, CHANGELOG.md, doc/测试报告-Max步数模式.md, doc/实施计划-Max步数模式.md
