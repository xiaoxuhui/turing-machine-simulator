import type { ExampleProject } from "./examples";
import { compactRuleArrows } from "./rule-format";

export type ExampleSourceStyle = "plain" | "commented";

const phaseNotes: Record<string, string> = {
  BOOT: "初始化纸带和计数器；之后的计算仍由下面的转移规则逐格执行。",
  scan: "先找到输入右端；此阶段只扫描，不提前处理进位。",
  carry: "从低位向左处理进位：连续的 1 变成 0，遇到 0 或空白写 1。",
  last: "只处理已经定位的最后一位。",
  "add.scan": "连接两段计数，把分隔符写成 1；这会暂时多出一格。",
  "add.trim": "擦掉多算的最后一格，得到真正的和。",
  "sub.pick": "每次标记右边一个未处理的 1，再去左边抵消一个。",
  "sub.take": "在左侧寻找可抵消的 1；找不到就不能得到非负结果。",
  "sub.erase": "右操作数用完，清理分隔符与工作标记。",
  "mul.pickA": "外层循环：选择一个尚未处理的左侧计数。",
  "mul.pickB": "内层循环：遍历右侧计数，每取一个就追加一个结果。",
  "mul.restore": "还原右侧标记，让下一次外层循环可以重新使用乘数。",
  "mul.clean": "清除输入与分隔符，只留下输出区的答案。",
};

export function exampleSource(project: ExampleProject, style: ExampleSourceStyle): string {
  const plain = compactRuleArrows(project.rules).split(/\r?\n/).filter(line => !line.trimStart().startsWith("#")).join("\n");
  if (style === "plain") return plain;
  const lines = [
    `# ${project.name}`,
    ...project.description.split(/\r?\n/).map(line => `# ${line}`),
    `# 初始输入：${project.input || "空纸带"}；初始状态：${project.initialState || "留空，使用首个调用"}；空白符：${project.blankSymbol}`,
    "# R 向右一格，L 向左一格，N 不移动；普通停机态以机器配置为准。",
  ];
  if (project.name.includes("超超幂")) lines.push("# 从结果 1 开始，每轮执行 底数↑↑旧结果；旧结果是下一轮的幂塔高度。");
  else if (project.name.includes("超幂")) lines.push("# 从结果 1 开始，每轮执行 底数^旧结果；幂塔右结合，不能当成重复乘法。");
  else if (project.name.includes("乘方")) lines.push("# 从结果 1 开始，按指数次数重复乘以底数；指数为 0 时不进入循环。");
  const seen = new Set<string>();
  for (const line of plain.split("\n")) {
    const text = line.trim();
    const indent = line.slice(0, line.length - line.trimStart().length);
    if (/^[^,():\s]+\([^()]*\):$/.test(text)) lines.push(`# 定义 ${text.slice(0, text.indexOf("("))}：括号前两个值是函数入口与正常完成状态。`);
    if (/^ret(?:\s|:)/.test(text)) lines.push(`${indent}# 只有到达这里声明的状态，才跳到外部或父函数的对应状态。`);
    if (/^导出状态(?:\s|:)/.test(text)) lines.push(`${indent}# 公开名称供外部补写或选择入口；这条声明本身不要求返回。`);
    const state = text.match(/^([^,\s]+),/)?.[1];
    if (state && phaseNotes[state] && !seen.has(state)) { lines.push(`${indent}# ${phaseNotes[state]}`); seen.add(state); }
    if (/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(text)) lines.push(`${indent}# 调用 ${text}；正常完成后从本调用下面继续。`);
    lines.push(line);
  }
  return lines.join("\n");
}
