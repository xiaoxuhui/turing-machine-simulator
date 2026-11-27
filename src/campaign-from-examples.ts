import type { CampaignCase, CampaignLevel } from "./campaign";
import type { ExampleProject } from "./examples";
import { builtinExamples } from "./example-catalog";
import { builtinExplanations, type Explanation } from "./example-learning";
import { existingExampleLevels, exampleLevelId } from "./example-level-links";

interface ExampleGoal { cases: CampaignCase[]; maxSteps?: number; objective: string; prerequisite: string }
const output = (input: string, expectedOutput: string): CampaignCase => ({ input, expectedOutput });
const status = (input: string, accepted: boolean): CampaignCase => ({ input, expectedOutput: accepted ? "接受" : "拒绝", mode: "status", expectedReason: accepted ? "accept" : "reject" });
const functionOutputs: Record<string, string> = {
  functionBasics: "1", functions: "11111", functionReturn: "12", functionComposition: "123", functionParentReturn: "123",
  functionExportEntry: "23", functionExportRepeat: "1212", functionExports: "1234", functionMixed: "11", functionMixedContinue: "123",
  functionStarDefaults: "RL", functionTypedParameters: "13", functionOmittedFields: "2L", functionStarLiterals: "***", functionWildcards: "A*", functionNestedNames: "111",
};
const goals: Record<string, ExampleGoal> = {
  gijswijt: { objective: "持续生成十进制吉斯维杰特数列，在观察步数内写出前九项，出现 3 后仍继续运行。", cases: [{ input: "", expectedOutput: "1|1|2|1|1|2|2|2|3", mode: "decimal-sequence-prefix", expectedReason: "step-limit" }], maxSteps: 10000, prerequisite: "copy-with-divider" },
  fibonacciDecimal: { objective: "从 0、1 开始，逐位相加前两项，持续写出十进制斐波那契数列，至少生成到 144。", cases: [{ input: "", expectedOutput: "0|1|1|2|3|5|8|13|21|34|55|89|144", mode: "decimal-sequence-prefix", expectedReason: "step-limit" }], maxSteps: 5000, prerequisite: "binary-addition" },
  palindrome: { objective: "逐对检查两端，回文接受，不是回文则拒绝。", cases: [status("", true), status("1001", true), status("101", true), status("1010", false)], prerequisite: "binary-complement" },
  unaryCompare: { objective: "比较两段一进制数字，只留下 <、= 或 >。", cases: [output("111?11", ">"), output("1?111", "<"), output("11?11", "="), output("?", "=")], prerequisite: "unary-addition" },
  unaryEven: { objective: "保留输入，用接受或拒绝状态报告一进制数能否整除 2。", cases: [status("", true), status("1", false), status("111", false), status("1111", true)], prerequisite: "unary-parity" },
  unaryDivide: { objective: "重复减去除数，每完整减一次才加一个商，余数舍去。", cases: [output("1111111/11", "111"), output("111/1111", ""), { ...status("1/", false), mode: "status" }], prerequisite: "unary-subtraction" },
  lambda: { objective: "用普通图灵机规则归约 (λx.λy.x) y，避开变量捕获，得到 λy0.y。", cases: [{ input: builtinExamples.lambda.input, expectedOutput: "λy0.y", mode: "lambda", expectedReason: "accept" }], maxSteps: 1000000, prerequisite: "function-ret" },
  brainfuck: { objective: "执行循环输出 A 的 BF 程序，检查纸带上真正产生的输出字节。", cases: [{ input: builtinExamples.brainfuck.input, expectedOutput: "A", mode: "brainfuck" }], maxSteps: 100000, prerequisite: "function-nested-repeat" },
  goldbach: { objective: "为每个给定偶数找到两个素数，输出它们的一进制分解并接受。", cases: [4, 10, 20].map(n => ({ input: "1".repeat(n), expectedOutput: `两个素数相加等于 ${n}`, mode: "goldbach", expectedReason: "accept" })), maxSteps: 100000, prerequisite: "unary-product" },
  collatz: { objective: "正整数反复做偶数除 2、奇数乘 3 加 1，到达 1 接受；0 拒绝。", cases: [status("1", true), status("110", true), status("111", true), status("0", false)], maxSteps: 100000, prerequisite: "binary-multiplication" },
};
for (const [id, expected] of Object.entries(functionOutputs)) goals[id] = {
  objective: `按本例的函数调用和返回方式，将给定输入处理为 ${expected}。`,
  cases: [output(builtinExamples[id].input, expected), ...(id === "functionWildcards" ? [output("Z", "Z")] : []), ...(id === "functions" ? [output("", "11")] : [])],
  maxSteps: 300, prerequisite: "function-wrap",
};
for (const [id, operator] of [["unarySuperRoot", "~~"], ["unarySuperLog", "@@"], ["unaryPentaRoot", "~~~"], ["unaryPentaLog", "@@@"]]) goals[id] = {
  objective: "保留原输入，用有界试算找到最后一个不超过上限的整数候选。",
  cases: [output(`11${operator}11111`, "11"), output(`11${operator}111`, "1")], maxSteps: 2000000,
  prerequisite: operator.includes("~") ? "unary-integer-root" : "unary-integer-log",
};

const tools: Record<string, { project: ExampleProject; learning: Explanation; goal: ExampleGoal }> = {
  universal: (() => {
    const project = builtinExamples.universal;
    return { project,
      learning: { summary: "在实验台上方的初始输入填写完整原文。通用机用转移规则逐字解析六项配置和规则表，在纸带上建立名称字典，再模拟目标机器，最后逐字写出 实际终态名称/当前结果。", steps: ["按 / 分隔读取初始纸带、空白符、初态、接受态、拒绝态和普通停机态；留空项仍保留分隔符。", "在纸带上为状态名和符号建立编号；按规则表匹配当前状态和读取值，执行目标读写和移动。", "遇到终态后从名称字典读出实际状态名，例如 HALT 或 结束，随后写 / 和结果，并清理工作区。"], walkthrough: ["1/0/q0///HALT/q0,1->HALT,1,N", "读写规则执行一次后，最终纸带为 HALT/1；若把终态改成 结束，则输出 结束/1"], notes: ["初始输入原文不在后台预先换成编码。生成器只确定有限字符字母表，解析、名称编号、模拟和最终输出都由转移规则执行。", "使用完整的五项普通转移规则；函数和通配规则先展开。字面 / 写 \\/，字面反斜杠写 \\\\。"] },
      goal: { objective: "直接读取原文配置和规则表，模拟目标机器，并在纸带上输出实际终态名称 HALT/1。", cases: [{ input: project.input, expectedOutput: "HALT/1", mode: "universal" }], maxSteps: 500000, prerequisite: "function-ret" } };
  })(),
};
const sources: Record<string, ExampleProject> = { ...builtinExamples, ...Object.fromEntries(Object.entries(tools).map(([id, tool]) => [id, tool.project])) };
export const exampleCampaignSolutions: Record<string, string> = {};
export const exampleCampaignLevels: CampaignLevel[] = Object.entries(sources).filter(([id]) => !Object.hasOwn(existingExampleLevels, id)).map(([id, project]) => {
  const goal = goals[id] ?? tools[id]?.goal, learning = builtinExplanations[id] ?? tools[id]?.learning;
  if (!goal || !learning) throw new Error(`示例缺少关卡目标或原理：${id}`);
  const levelId = exampleLevelId(id);
  exampleCampaignSolutions[levelId] = project.rules;
  return {
    id: levelId, sourceExampleId: id, prerequisite: goal.prerequisite,
    section: project.category === "函数教程" ? "tutorial" : ["palindrome", "unaryCompare", "unaryEven", "unaryDivide"].includes(id) ? "challenge" : "hard",
    difficulty: project.category === "函数教程" ? 2 : 3,
    title: project.name, objective: goal.objective, concept: learning.summary.split("。")[0] + "。",
    lesson: { explanation: learning.summary, steps: learning.steps, syntax: [
      `空白符为 ${project.blankSymbol}，初始状态为 ${project.initialState}。`,
      "终止状态按本关固定配置判断；普通停机、接受和拒绝不能混用。",
      ...(learning.notes ?? []),
    ], workedExample: { title: "原理与实现", stages: learning.walkthrough } },
    starter: { ...project, rules: `# ${goal.objective}\n# 入口：${project.initialState}\n# ${learning.steps[0]}\n` },
    cases: goal.cases, maxSteps: goal.maxSteps ?? 100000,
  };
});
