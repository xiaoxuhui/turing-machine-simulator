import type { CampaignCase, CampaignLevel } from "./campaign";
import type { ExampleProject } from "./examples";
import { builtinExamples } from "./example-catalog";
import { builtinExplanations, type Explanation } from "./example-learning";
import { existingExampleLevels, exampleLevelId } from "./example-level-links";
import { compileGijswijtMachine } from "./gijswijt-tm";
import { makeUniversalProject } from "./universal-machine";

interface ExampleGoal { cases: CampaignCase[]; maxSteps?: number; objective: string; prerequisite: string }
const output = (input: string, expectedOutput: string): CampaignCase => ({ input, expectedOutput });
const status = (input: string, accepted: boolean): CampaignCase => ({ input, expectedOutput: accepted ? "接受" : "拒绝", mode: "status", expectedReason: accepted ? "accept" : "reject" });
const functionOutputs: Record<string, string> = {
  functionBasics: "1", functions: "11111", functionReturn: "12", functionComposition: "123", functionParentReturn: "123",
  functionExportEntry: "23", functionExportRepeat: "1212", functionExports: "1234", functionMixed: "11", functionMixedContinue: "123",
  functionStarDefaults: "RL", functionTypedParameters: "13", functionOmittedFields: "2L", functionStarLiterals: "***", functionWildcards: "A*", functionNestedNames: "111",
};
const goals: Record<string, ExampleGoal> = {
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
  gijswijt: { project: compileGijswijtMachine(2),
    learning: { summary: "枚举非空后缀块，比较它在末尾连续重复的次数，取最大次数作为下一项。阈值为 2，生成到第一次超过 2 的项也要写出后才停机。", steps: ["从 1 开始，枚举可能的后缀块长度。", "从后向前逐块比较，保存最大的重复次数。", "追加该次数，重复计算；本关第一次写出 3 后停机。"], walkthrough: ["1 → 11 → 112 → 1121", "最后得到 1,1,2,1,1,2,2,2,3"] },
    goal: { objective: "空纸带按重复后缀定义生成数列，阈值 2，写出第一项 3 后停机。", cases: [output("", "112112223")], maxSteps: 10000, prerequisite: "copy-with-divider" } },
  universal: (() => {
    const compiled = makeUniversalProject({ rules: "q0,□->HALT,1,N", input: "", initialState: "q0", haltStates: "HALT", acceptStates: "", rejectStates: "" }, "□", null);
    return { project: compiled.project,
      learning: { summary: "把被模拟机器的规则与配置作为纸带数据，解释器查找当前状态和符号对应的规则，修改被模拟纸带并报告停止、接受或拒绝。", steps: ["读编码的规则表、纸带、当前状态和头位置。", "找到匹配规则，执行一次目标机器的读写和移动。", "到目标终止状态后输出目标纸带与结论。"], walkthrough: ["目标规则 q0,□->HALT,1,N：空纸带写 1", "目标进入 HALT → 报告输出 1、结论停止"] },
      goal: { objective: "解释编码规则，模拟目标机器在空纸带写 1 并停止，输出纸带与结论。", cases: [{ input: compiled.project.input, expectedOutput: "1（停止）", mode: "universal", alphabet: compiled.alphabet }], maxSteps: 500000, prerequisite: "function-ret" } };
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
