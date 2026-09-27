import { inputToTape, TuringMachine, type MachineDefinition, type StopReason, type Tape } from "./core";
import type { ExampleProject } from "./examples";

export interface CampaignCase {
  input: string;
  expectedOutput: string;
}

export interface CampaignLevel {
  id: string;
  title: string;
  objective: string;
  concept: string;
  lesson: {
    explanation: string;
    steps: string[];
    syntax: string[];
  };
  starter: ExampleProject;
  cases: CampaignCase[];
  maxSteps: number;
}

export interface CampaignCaseResult extends CampaignCase {
  actualOutput: string;
  steps: number;
  reason: StopReason | "step-limit";
  passed: boolean;
}

export interface CampaignVerification {
  passed: boolean;
  passedCount: number;
  totalCount: number;
  cases: CampaignCaseResult[];
}

export interface CampaignProgress {
  version: 1;
  completedLevelIds: string[];
  drafts: Record<string, string>;
}

const base = {
  description: "关卡练习草稿：根据教程独立完成规则。",
  acceptStates: "",
  rejectStates: "",
  haltStates: "HALT",
};

export const campaignLevels: CampaignLevel[] = [
  {
    id: "write-one",
    title: "第 1 关 · 点亮纸带",
    objective: "从空纸带开始，写下一个 1 后停机。",
    concept: "认识空白符、写入和停机状态。",
    lesson: {
      explanation: "一条转移规则说明：处于某状态、读到某符号时，要切换到什么状态、写什么、向哪边移动。",
      steps: ["找到读写头当前的空白符 □。", "把 □ 改写成 1。", "进入 HALT 状态并保持不动。"],
      syntax: ["N = 不移动", "HALT = 普通停机状态"],
    },
    maxSteps: 4,
    cases: [{ input: "", expectedOutput: "1" }],
    starter: { ...base, name: "关卡 1：点亮纸带", input: "", blankSymbol: "□", initialState: "q0", rules: "# 写出 q0 读取 □ 时的规则\n" },
  },
  {
    id: "unary-increment",
    title: "第 2 关 · 一进制加一",
    objective: "在连续的一串 1 末尾再写一个 1。",
    concept: "向右扫描，直到遇到第一个空白格。",
    lesson: {
      explanation: "扫描是一种最常用的图灵机套路：保持状态不变，逐格移动，直到读到边界符号。",
      steps: ["读到 1 时原样写回并向右移动。", "继续保持 q0，重复扫描。", "读到 □ 时写入新的 1 并停机。"],
      syntax: ["R = 向右移动一格", "保持 q0 = 下一步继续使用同一套扫描规则"],
    },
    maxSteps: 16,
    cases: ["1", "11", "111"].map((input) => ({ input, expectedOutput: `${input}1` })),
    starter: { ...base, name: "关卡 2：一进制加一", input: "111", blankSymbol: "□", initialState: "q0", rules: "q0,1 -> q0,1,R\n# 补全遇到 □ 时的规则\n" },
  },
  {
    id: "erase-one",
    title: "第 3 关 · 擦掉一格",
    objective: "把纸带上唯一的 1 擦成空白后停机。",
    concept: "用空白符覆盖已有内容。",
    lesson: {
      explanation: "写入空白符就等于擦除当前格。这一关先只处理一格，避免同时考虑扫描。",
      steps: ["读到当前格的 1。", "写回空白符 □。", "进入 HALT，不需要移动。"],
      syntax: ["写入 □ = 清空当前格", "读取符号和写入符号可以不同"],
    },
    maxSteps: 4,
    cases: [{ input: "1", expectedOutput: "" }],
    starter: { ...base, name: "关卡 3：擦掉一格", input: "1", blankSymbol: "□", initialState: "q0", rules: "# 把当前的 1 改写成 □\n" },
  },
  {
    id: "erase-unary",
    title: "第 4 关 · 清理纸带",
    objective: "擦除纸带上的所有 1，留下空纸带。",
    concept: "用空白符覆盖内容，并判断输入末尾。",
    lesson: {
      explanation: "把上一关的单格擦除放进扫描循环，就能处理任意长度，而不是只记住示例输入。",
      steps: ["每次读到 1 都写成 □。", "向右移动并继续使用 q0。", "读到末尾的 □ 时停机。"],
      syntax: ["循环规则：下一状态仍是 q0", "边界规则：读到 □ 后转入 HALT"],
    },
    maxSteps: 16,
    cases: ["1", "11", "1111"].map((input) => ({ input, expectedOutput: "" })),
    starter: { ...base, name: "关卡 4：清理纸带", input: "111", blankSymbol: "□", initialState: "q0", rules: "# 先写擦除 1 并右移的规则，再写扫描结束规则\n" },
  },
  {
    id: "zeros-to-ones",
    title: "第 5 关 · 填满 1",
    objective: "把所有 0 改成 1，同时保留原来的 1。",
    concept: "为两种读取符号分别作出选择。",
    lesson: {
      explanation: "同一个状态可以根据读到 0 或 1 走不同规则。这是二进制程序的第一步。",
      steps: ["读到 0：写 1、右移。", "读到 1：仍写 1、右移。", "读到 □：停机。"],
      syntax: ["每个“状态 + 读取符号”最多一条规则", "0、1、□ 三种情况都要覆盖"],
    },
    maxSteps: 24,
    cases: [
      { input: "0", expectedOutput: "1" },
      { input: "1", expectedOutput: "1" },
      { input: "0101", expectedOutput: "1111" },
    ],
    starter: { ...base, name: "关卡 5：填满 1", input: "0101", blankSymbol: "□", initialState: "q0", rules: "q0,0 -> q0,1,R\n# 补全读取 1 和 □ 的规则\n" },
  },
  {
    id: "binary-complement",
    title: "第 6 关 · 二进制取反",
    objective: "把输入中的每个 0 变成 1、每个 1 变成 0。",
    concept: "为不同读取符号编写不同转移。",
    lesson: {
      explanation: "现在让两个分支写出不同结果：0 写成 1，1 写成 0。扫描结构与上一关完全相同。",
      steps: ["保留上一关的三种情况。", "把读取 1 时的写入值改为 0。", "用多个混合输入检查是否每一位都处理。"],
      syntax: ["q0,0 与 q0,1 是两个独立分支", "只改变写入值，不改变扫描方向"],
    },
    maxSteps: 24,
    cases: [
      { input: "0", expectedOutput: "1" },
      { input: "1", expectedOutput: "0" },
      { input: "0101", expectedOutput: "1010" },
    ],
    starter: { ...base, name: "关卡 6：二进制取反", input: "0101", blankSymbol: "□", initialState: "q0", rules: "q0,0 -> q0,1,R\n# 补全读取 1 和 □ 的规则\n" },
  },
  {
    id: "turn-back",
    title: "第 7 关 · 到末尾再回头",
    objective: "扫描到二进制串末尾，回到最后一位，把它设为 1。",
    concept: "切换状态并向左移动，分成“寻找末尾”和“处理末位”两个阶段。",
    lesson: {
      explanation: "复杂程序通常分阶段。scan 只负责找到末尾；读到 □ 后切换到 last 并左移一格。",
      steps: ["在 scan 状态越过所有 0 和 1。", "遇到 □：切换到 last，保持 □，向左移动。", "在 last 状态把 0 或 1 都写成 1，然后停机。"],
      syntax: ["L = 向左移动一格", "切换状态 = 从下一步开始使用另一组规则"],
    },
    maxSteps: 28,
    cases: [
      { input: "0", expectedOutput: "1" },
      { input: "1", expectedOutput: "1" },
      { input: "1010", expectedOutput: "1011" },
      { input: "1011", expectedOutput: "1011" },
    ],
    starter: { ...base, name: "关卡 7：到末尾再回头", input: "1010", blankSymbol: "□", initialState: "scan", rules: "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\n# 补全转向和 last 状态规则\n" },
  },
  {
    id: "binary-increment",
    title: "第 8 关 · 二进制加一",
    objective: "把纸带上的无符号二进制数加一。",
    concept: "先寻找末尾，再从低位向左传播进位。",
    lesson: {
      explanation: "沿用上一关的“扫描后回头”。carry 状态处理进位：遇 1 写 0 并继续向左，遇 0 写 1 后结束。",
      steps: ["先用 scan 找到末尾，再切换到 carry 左移。", "carry 读到 1：写 0、继续左移。", "carry 读到 0：写 1、停机。", "如果一路越过最高位遇到 □：写 1、停机。"],
      syntax: ["进位会连续跨过多个 1", "全 1 输入需要在左侧空白格新增最高位"],
    },
    maxSteps: 40,
    cases: [
      { input: "0", expectedOutput: "1" },
      { input: "1", expectedOutput: "10" },
      { input: "1011", expectedOutput: "1100" },
      { input: "111", expectedOutput: "1000" },
    ],
    starter: {
      ...base,
      name: "关卡 5：二进制加一",
      input: "1011",
      blankSymbol: "□",
      initialState: "scan",
      rules: "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> carry,□,L\n# 补全 carry 状态的 0、1、□ 三种规则\n",
    },
  },
];

export function tapeOutput(tape: Tape): string {
  const entries = tape.entries();
  if (!entries.length) return "";
  const min = entries[0][0];
  const max = entries[entries.length - 1][0];
  let output = "";
  for (let position = min; position <= max; position += 1) output += tape.read(position);
  return output;
}

export function verifyLevel(level: CampaignLevel, definition: MachineDefinition): CampaignVerification {
  const results = level.cases.map((testCase): CampaignCaseResult => {
    const machine = new TuringMachine(definition, inputToTape(testCase.input, definition.blankSymbol));
    let reason: StopReason | "step-limit" = "step-limit";
    while (machine.stepCount < level.maxSteps) {
      const result = machine.step();
      if (result.stopped) {
        reason = result.reason!;
        break;
      }
    }
    const actualOutput = tapeOutput(machine.tape);
    return {
      ...testCase,
      actualOutput,
      steps: machine.stepCount,
      reason,
      passed: reason !== "step-limit" && actualOutput === testCase.expectedOutput,
    };
  });
  const passedCount = results.filter((result) => result.passed).length;
  return { passed: passedCount === results.length, passedCount, totalCount: results.length, cases: results };
}

export function emptyCampaignProgress(): CampaignProgress {
  return { version: 1, completedLevelIds: [], drafts: {} };
}

export function normalizeCampaignProgress(value: unknown): CampaignProgress {
  if (typeof value !== "object" || value === null) return emptyCampaignProgress();
  const candidate = value as { version?: unknown; completedLevelIds?: unknown; drafts?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.completedLevelIds)) return emptyCampaignProgress();
  const known = new Set(campaignLevels.map((level) => level.id));
  const completedLevelIds = [...new Set(candidate.completedLevelIds.filter((id): id is string => typeof id === "string" && known.has(id)))];
  const drafts = typeof candidate.drafts === "object" && candidate.drafts !== null
    ? Object.fromEntries(Object.entries(candidate.drafts).filter(([id, draft]) => known.has(id) && typeof draft === "string" && draft.length <= 100_000))
    : {};
  return { version: 1, completedLevelIds, drafts };
}

export function isLevelUnlocked(progress: CampaignProgress, levelId: string): boolean {
  const index = campaignLevels.findIndex((level) => level.id === levelId);
  if (index < 0) return false;
  return campaignLevels.slice(0, index).every((level) => progress.completedLevelIds.includes(level.id));
}

export function completeLevel(progress: CampaignProgress, levelId: string): CampaignProgress {
  if (!isLevelUnlocked(progress, levelId) || progress.completedLevelIds.includes(levelId)) return progress;
  return { ...progress, completedLevelIds: [...progress.completedLevelIds, levelId] };
}
