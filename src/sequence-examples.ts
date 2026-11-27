import { compileGijswijtMachine } from "./gijswijt-tm";
import { makeDecimalFibonacci } from "./fibonacci-decimal";
import type { ExampleProject } from "./examples";
import type { Explanation } from "./example-learning";

export const sequenceExamples: Record<string, ExampleProject> = {
  gijswijt: { ...compileGijswijtMachine(null), category: "数列生成" },
  fibonacciDecimal: makeDecimalFibonacci(),
};

export const sequenceExplanations: Record<string, Explanation> = {
  gijswijt: {
    summary: "从 1 开始，枚举整个数列的非空后缀块，取连续重复的最大次数作为下一项。十进制一位一格，用 | 分隔各项，一直生成，不因出现 3 或其他数值而停机。",
    steps: ["G.origin、G.shiftO 只在 | 处选择后缀块起点，避免把多位数拆成几项。", "G.compare、G.findB 用 A/B 游标逐格比较相邻块；完整匹配一次就让左侧重复计数加一。", "G.merge 保留所有候选块的最大重复次数；工作计数器随纸带增长。", "G.addDigit 把最大次数逐位写成十进制，包含 9→10 的进位；完成后进入 G.next，继续生成。"],
    walkthrough: ["|1 → |1|1 → |1|1|2", "|1|1|2|1|1|2 的后缀块 |1|1|2 重复两次 → 再写 |2", "第一项 3 后仍继续：1|1|2|1|1|2|2|2|3|1…"],
    notes: ["首个 | 表示首项边界；□ 是空白，0 是数字。@ 左侧为工作区，O/S/A/B 为隐藏的位置标记。", "默认 Max 步数，使用实验台的运行、单步、暂停；有限前缀正确不等于证明之后的所有项都正确。"],
  },
  fibonacciDecimal: {
    summary: "从 0、1 开始，每一项等于前两项之和。图灵机从个位到高位逐列相加，把进位放在状态中，十进制一位一格，用 | 分隔，不设项数和数值停机上限。",
    steps: ["F.markA、F.markB 标记前两项的个位；原数保留，下一轮还能继续使用。", "F.readA、F.readB 记住当前两位与进位，相加后 F.write 将个位写到右端；两游标向左推进，越过某数的首位后补 0。", "从个位开始写出的结果暂时倒序，例如 8+13 先写 12；F.toR、F.toL 从两端交换数字，得到 21。", "F.commit 清除新项的待写入标记；F.next 把末两项当作新的加数，继续运行。"],
    walkthrough: ["0|1 → 0|1|1 → 0|1|1|2 → … → 5|8|13", "8+13：个位 8+3=11，写 1、进位 1；十位 0+1+1=2，写 2", "把倒序的 12 原地交换成 21；下一轮算 13+21=34"],
    notes: ["0 是正常首项，空白为 □；开头的 | 是首项边界。计算中的隐藏标记不会改变最终数字。", "纸带上的每一项由普通转移规则算出，显示和 JavaScript 不代算下一项。"],
  },
};
