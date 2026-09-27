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
  hint: string;
  template: ExampleProject;
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
}

const base = {
  description: "关卡起始模板：补全或修改规则后提交验证。",
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
    hint: "只需要处理 q0 读到空白符 □ 的情况。",
    maxSteps: 4,
    cases: [{ input: "", expectedOutput: "1" }],
    template: { ...base, name: "关卡 1：点亮纸带", input: "", blankSymbol: "□", initialState: "q0", rules: "q0,□ -> HALT,1,N" },
  },
  {
    id: "unary-increment",
    title: "第 2 关 · 一进制加一",
    objective: "在连续的一串 1 末尾再写一个 1。",
    concept: "向右扫描，直到遇到第一个空白格。",
    hint: "读到 1 时向右移动；读到 □ 时写 1 并停机。",
    maxSteps: 16,
    cases: ["1", "11", "111"].map((input) => ({ input, expectedOutput: `${input}1` })),
    template: { ...base, name: "关卡 2：一进制加一", input: "111", blankSymbol: "□", initialState: "q0", rules: "q0,1 -> q0,1,R\nq0,□ -> HALT,1,N" },
  },
  {
    id: "erase-unary",
    title: "第 3 关 · 清理纸带",
    objective: "擦除纸带上的所有 1，留下空纸带。",
    concept: "用空白符覆盖内容，并判断输入末尾。",
    hint: "每读到一个 1 就写成 □ 并右移。",
    maxSteps: 16,
    cases: ["1", "11", "1111"].map((input) => ({ input, expectedOutput: "" })),
    template: { ...base, name: "关卡 3：清理纸带", input: "111", blankSymbol: "□", initialState: "q0", rules: "q0,1 -> q0,□,R\nq0,□ -> HALT,□,N" },
  },
  {
    id: "binary-complement",
    title: "第 4 关 · 二进制取反",
    objective: "把输入中的每个 0 变成 1、每个 1 变成 0。",
    concept: "为不同读取符号编写不同转移。",
    hint: "0 和 1 都要向右移动，遇到 □ 时停机。",
    maxSteps: 24,
    cases: [
      { input: "0", expectedOutput: "1" },
      { input: "1", expectedOutput: "0" },
      { input: "0101", expectedOutput: "1010" },
    ],
    template: { ...base, name: "关卡 4：二进制取反", input: "0101", blankSymbol: "□", initialState: "q0", rules: "q0,0 -> q0,1,R\nq0,1 -> q0,0,R\nq0,□ -> HALT,□,N" },
  },
  {
    id: "binary-increment",
    title: "第 5 关 · 二进制加一",
    objective: "把纸带上的无符号二进制数加一。",
    concept: "先寻找末尾，再从低位向左传播进位。",
    hint: "扫描到末尾后左移：1 变 0 并继续进位，0 变 1 后停机。",
    maxSteps: 40,
    cases: [
      { input: "0", expectedOutput: "1" },
      { input: "1", expectedOutput: "10" },
      { input: "1011", expectedOutput: "1100" },
      { input: "111", expectedOutput: "1000" },
    ],
    template: {
      ...base,
      name: "关卡 5：二进制加一",
      input: "1011",
      blankSymbol: "□",
      initialState: "scan",
      rules: "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> carry,□,L\ncarry,0 -> HALT,1,N\ncarry,1 -> carry,0,L\ncarry,□ -> HALT,1,N",
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
  return { version: 1, completedLevelIds: [] };
}

export function normalizeCampaignProgress(value: unknown): CampaignProgress {
  if (typeof value !== "object" || value === null) return emptyCampaignProgress();
  const candidate = value as { version?: unknown; completedLevelIds?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.completedLevelIds)) return emptyCampaignProgress();
  const known = new Set(campaignLevels.map((level) => level.id));
  const completedLevelIds = [...new Set(candidate.completedLevelIds.filter((id): id is string => typeof id === "string" && known.has(id)))];
  return { version: 1, completedLevelIds };
}

export function isLevelUnlocked(progress: CampaignProgress, levelId: string): boolean {
  const index = campaignLevels.findIndex((level) => level.id === levelId);
  if (index < 0) return false;
  return campaignLevels.slice(0, index).every((level) => progress.completedLevelIds.includes(level.id));
}

export function completeLevel(progress: CampaignProgress, levelId: string): CampaignProgress {
  if (!isLevelUnlocked(progress, levelId) || progress.completedLevelIds.includes(levelId)) return progress;
  return { version: 1, completedLevelIds: [...progress.completedLevelIds, levelId] };
}
