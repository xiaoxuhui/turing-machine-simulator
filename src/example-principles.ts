import { builtinExplanations, type Explanation } from "./example-learning";
import { exampleLevelId } from "./example-level-links";
import { examples } from "./examples";
import { campaignLevels, type CampaignLevel } from "./campaign";

export interface ExamplePrinciple {
  id: string; name: string; category: string; input: string; summary: string;
  steps: string[]; walkthrough: string[]; notes: string[]; levelId?: string; laboratoryUrl: string;
}

const fromLevel = (level: CampaignLevel): Explanation => ({
  summary: level.lesson.explanation, steps: level.lesson.steps,
  walkthrough: level.lesson.workedExample?.stages ?? level.cases.map(item => `${item.input || "空纸带"} → ${item.expectedOutput || "空纸带"}`),
  notes: [...level.lesson.syntax, ...(level.lesson.implementationGuide ? [level.lesson.implementationGuide.tape, ...level.lesson.implementationGuide.steps, ...level.lesson.implementationGuide.checkpoints] : [])],
});
export const examplePrinciples: ExamplePrinciple[] = Object.entries(examples).map(([id, project]) => {
  const levelId = project.campaignLevelId ?? exampleLevelId(id);
  const level = campaignLevels.find(item => item.id === levelId);
  const explanation = level ? fromLevel(level) : builtinExplanations[id];
  if (!explanation) throw new Error(`缺少示例原理：${id}`);
  return { id, name: project.name, category: project.category ?? "基础示例", input: project.input,
    ...explanation, notes: explanation.notes ?? [], levelId,
    laboratoryUrl: `./?example=${encodeURIComponent(id)}` };
});
examplePrinciples.push(
  { id: "gijswijt-tool", levelId: "example-gijswijt", name: "吉斯维杰特数列生成器", category: "生成器", input: "整数阈值，例如 2",
    summary: "从 1 开始。对当前序列找最长重复后缀 Y^k，把最大的重复次数 k 作为下一项。Y 可长可短，不是只数相同的最后一位。",
    steps: ["枚举非空后缀块 Y。", "从尾部向前逐块比较，统计连续重复次数。", "在所有块的重复次数中取最大值 k，追加 k。", "对新序列重复，写出的项超过指定阈值才停机。"],
    walkthrough: ["1 → 11（后缀 1 只重复 1 次）", "11 → 112（1 重复 2 次）；112 → 1121", "112112 的后缀块 112 连续重复 2 次，所以还要考虑长度大于 1 的块"],
    notes: ["直接计算和普通图灵机规则两种模式执行同一定义；阈值限制可写整数，超过阈值的项也会显示。"], laboratoryUrl: "./#gijswijtTitle" },
  { id: "universal-tool", levelId: "example-universal", name: "通用图灵机", category: "生成器", input: "被模拟机器的规则、初始纸带与初始/终止状态",
    summary: "把另一台机器的规则表和配置写成纸带数据，解释器本身仍是一台固定规则的图灵机。",
    steps: ["编码目标规则、纸带、读写头和当前状态；转义分隔符以保留原字符。", "找到目标读写头的符号，在编码规则表中寻找对应状态和读取符号。", "改写目标纸带，更新目标状态与头位置。", "检查目标停止、接受或拒绝状态，输出目标纸带和结论；否则继续。"],
    walkthrough: ["目标规则 q0,|->H,1,N；输入空 → 解释器找到 q0 与 |", "写入 1、状态 H、头不动 → 输出 1，状态为停止"],
    notes: ["解释器可能用许多底层步骤模拟目标的一步；它是在解释规则数据，不是让 JavaScript 代算目标结果。"], laboratoryUrl: "./#universalTitle" },
);
