import { inputToTape, TuringMachine, type MachineDefinition, type StopReason, type Tape } from "./core";
import type { ExampleProject } from "./examples";

export interface CampaignCase {
  input: string;
  expectedOutput: string;
}

export interface CampaignLevel {
  id: string;
  section: CampaignSectionId;
  difficulty: 1 | 2 | 3;
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

export type CampaignSectionId = "tutorial" | "challenge" | "hard";

export interface CampaignSection {
  id: CampaignSectionId;
  title: string;
  description: string;
}

export const campaignSections: CampaignSection[] = [
  { id: "tutorial", title: "教程", description: "小步学习规则、扫描、分支与状态切换" },
  { id: "challenge", title: "闯关", description: "组合已学套路，只给策略提示" },
  { id: "hard", title: "高难", description: "多阶段算法、临时标记与边界处理" },
];

export interface CampaignCaseResult extends CampaignCase {
  actualOutput: string;
  steps: number;
  reason: StopReason | "step-limit";
  stoppedState: string;
  readSymbol: string;
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
    section: "tutorial",
    difficulty: 1,
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
    id: "move-right-write",
    section: "tutorial",
    difficulty: 1,
    title: "第 2 关 · 走一步再写",
    objective: "越过现有的 1，在右侧空白格再写一个 1。",
    concept: "把移动和写入拆成连续两步。",
    lesson: {
      explanation: "图灵机每次只执行一条规则。先处理当前的 1 并右移，下一步才会读到右侧空白格。",
      steps: ["读到 1 时保持 1，切换到 write 并右移。", "write 读到 □ 时写入 1。", "写完进入 HALT。"],
      syntax: ["状态可以记录“下一步要做什么”", "一条规则只能移动一格"],
    },
    maxSteps: 6,
    cases: [{ input: "1", expectedOutput: "11" }],
    starter: { ...base, name: "关卡 2：走一步再写", input: "1", blankSymbol: "□", initialState: "q0", rules: "q0,1 -> write,1,R\n# 补全 write 读取 □ 的规则\n" },
  },
  {
    id: "unary-increment",
    section: "tutorial",
    difficulty: 1,
    title: "第 3 关 · 一进制加一",
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
    section: "tutorial",
    difficulty: 1,
    title: "第 4 关 · 擦掉一格",
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
    section: "tutorial",
    difficulty: 1,
    title: "第 5 关 · 清理纸带",
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
    id: "unary-decrement",
    section: "tutorial",
    difficulty: 2,
    title: "第 6 关 · 删除末位",
    objective: "删除一进制数字最右侧的一个 1。",
    concept: "先找到末尾，再向左回退一格处理。",
    lesson: {
      explanation: "这是一道连接扫描与回头操作的过渡关。scan 找到末尾，erase 回到最后一个 1 并擦除。",
      steps: ["scan 越过所有 1。", "遇到 □ 后切换 erase 并左移。", "erase 读到 1 时写 □ 并停机。"],
      syntax: ["先 R 扫描，再 L 回退", "状态名可以直接表达阶段职责"],
    },
    maxSteps: 20,
    cases: [
      { input: "1", expectedOutput: "" },
      { input: "11", expectedOutput: "1" },
      { input: "1111", expectedOutput: "111" },
    ],
    starter: { ...base, name: "关卡 6：删除末位", input: "111", blankSymbol: "□", initialState: "scan", rules: "scan,1 -> scan,1,R\n# 补全末尾转向和擦除规则\n" },
  },
  {
    id: "zeros-to-ones",
    section: "tutorial",
    difficulty: 2,
    title: "第 7 关 · 填满 1",
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
    section: "tutorial",
    difficulty: 2,
    title: "第 8 关 · 二进制取反",
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
    section: "tutorial",
    difficulty: 2,
    title: "第 9 关 · 到末尾再回头",
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
    section: "tutorial",
    difficulty: 3,
    title: "第 10 关 · 二进制加一",
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
      name: "关卡 10：二进制加一",
      input: "1011",
      blankSymbol: "□",
      initialState: "scan",
      rules: "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> carry,□,L\n# 补全 carry 状态的 0、1、□ 三种规则\n",
    },
  },
  {
    id: "copy-first-bit",
    section: "challenge",
    difficulty: 1,
    title: "第 11 关 · 记住第一位",
    objective: "把输入的第一位复制到二进制串末尾。",
    concept: "用状态记住一个符号，再带着记忆扫描。",
    lesson: {
      explanation: "状态不仅表示流程阶段，也能保存有限信息。读到首位后进入 remember0 或 remember1。",
      steps: ["读取首位并进入对应的记忆状态。", "保持记忆状态扫描到末尾。", "在末尾写出记住的位。"],
      syntax: ["不同状态可以编码 0/1 两种记忆", "两个记忆状态需要分别覆盖扫描符号"],
    },
    maxSteps: 30,
    cases: [
      { input: "0", expectedOutput: "00" }, { input: "1", expectedOutput: "11" },
      { input: "010", expectedOutput: "0100" }, { input: "101", expectedOutput: "1011" },
    ],
    starter: { ...base, name: "闯关 1：记住第一位", input: "101", blankSymbol: "□", initialState: "start", rules: "# 提示：首位为 0/1 时进入两个不同状态\n" },
  },
  {
    id: "alternating-unary",
    section: "challenge",
    difficulty: 2,
    title: "第 12 关 · 交替改写",
    objective: "把连续的 1 从左到右改写成 1010…",
    concept: "两个状态轮流工作，形成周期。",
    lesson: {
      explanation: "用 write1 和 write0 两个状态表示下一格应该写什么；每处理一格就切换状态。",
      steps: ["从 write1 开始。", "写 1 后切换 write0。", "写 0 后切回 write1。", "任一状态遇到 □ 都停机。"],
      syntax: ["状态循环可以产生周期输出", "奇数和偶数长度都要正确停机"],
    },
    maxSteps: 30,
    cases: [
      { input: "1", expectedOutput: "1" }, { input: "11", expectedOutput: "10" },
      { input: "11111", expectedOutput: "10101" },
    ],
    starter: { ...base, name: "闯关 2：交替改写", input: "11111", blankSymbol: "□", initialState: "write1", rules: "# 用 write1 / write0 两个状态交替处理\n" },
  },
  {
    id: "binary-decrement",
    section: "challenge",
    difficulty: 2,
    title: "第 13 关 · 二进制减一",
    objective: "对固定宽度的正二进制数减一。",
    concept: "从低位向左传播借位。",
    lesson: {
      explanation: "先扫描到末尾。borrow 遇 0 时写 1 并继续借位；遇 1 时写 0 并结束。",
      steps: ["扫描到输入右端。", "进入 borrow 并左移。", "借位越过连续的 0。", "遇到 1 后完成减法。"],
      syntax: ["本关保留输入宽度", "测试输入始终大于 0"],
    },
    maxSteps: 50,
    cases: [
      { input: "1", expectedOutput: "0" }, { input: "10", expectedOutput: "01" },
      { input: "1000", expectedOutput: "0111" }, { input: "1010", expectedOutput: "1001" },
    ],
    starter: { ...base, name: "闯关 3：二进制减一", input: "1000", blankSymbol: "□", initialState: "scan", rules: "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\n# 自己设计 borrow 阶段\n" },
  },
  {
    id: "unary-parity",
    section: "challenge",
    difficulty: 3,
    title: "第 14 关 · 判断奇偶",
    objective: "擦除一进制输入；长度为奇数输出 1，偶数输出 0。",
    concept: "状态在扫描过程中保存奇偶性。",
    lesson: {
      explanation: "每读到一个 1，就在 even 与 odd 之间切换，同时擦除已读内容。末尾状态就是答案。",
      steps: ["从 even 开始扫描并擦除。", "每读一个 1 就切换奇偶状态。", "末尾根据当前状态写 0 或 1。"],
      syntax: ["有限状态适合保存奇偶性", "边扫描边擦除可让最终纸带只留下答案"],
    },
    maxSteps: 40,
    cases: [
      { input: "1", expectedOutput: "1" }, { input: "11", expectedOutput: "0" },
      { input: "111", expectedOutput: "1" }, { input: "1111", expectedOutput: "0" },
    ],
    starter: { ...base, name: "闯关 4：判断奇偶", input: "111", blankSymbol: "□", initialState: "even", rules: "# 提示：even 和 odd 每读一个 1 就互相切换\n" },
  },
  {
    id: "twos-complement",
    section: "hard",
    difficulty: 2,
    title: "第 15 关 · 二进制补码",
    objective: "在固定宽度内求二进制数的二进制补码。",
    concept: "从右侧保留到第一个 1，再翻转其左侧所有位。",
    lesson: {
      explanation: "先到末尾，从右向左寻找第一个 1；右侧的 0 和这个 1 保持不变，此后进入 flip 翻转所有高位。",
      steps: ["scan 找到末尾。", "seek 向左越过 0。", "seek 遇到第一个 1 后切换 flip。", "flip 翻转剩余高位并在左边界停机。"],
      syntax: ["全 0 输入会一路 seek 到左边界", "固定宽度意味着保留前导 0"],
    },
    maxSteps: 80,
    cases: [
      { input: "0", expectedOutput: "0" }, { input: "1", expectedOutput: "1" },
      { input: "10", expectedOutput: "10" }, { input: "0110", expectedOutput: "1010" },
      { input: "10100", expectedOutput: "01100" },
    ],
    starter: { ...base, name: "高难 1：二进制补码", input: "0110", blankSymbol: "□", initialState: "scan", rules: "# 分成 scan、seek、flip 三个阶段\n" },
  },
  {
    id: "unary-double",
    section: "hard",
    difficulty: 3,
    title: "第 16 关 · 一进制翻倍",
    objective: "把 n 个连续的 1 变成 2n 个连续的 1。",
    concept: "用 X 标记已处理输入，用 Y 标记新副本，最后统一还原。",
    lesson: {
      explanation: "不能边读边直接追加普通 1，否则无法区分原输入与副本。临时符号让机器知道哪些格已经处理。",
      steps: ["seek 找到未处理的 1 并标成 X。", "toEnd 到末尾追加一个 Y。", "return 回左边界，重复处理。", "没有未处理的 1 后，把 X、Y 全部恢复为 1。"],
      syntax: ["X/Y 是工作符号，停机前必须清理", "需要多次往返扫描，步数明显增加"],
    },
    maxSteps: 400,
    cases: [
      { input: "1", expectedOutput: "11" }, { input: "11", expectedOutput: "1111" },
      { input: "111", expectedOutput: "111111" }, { input: "1111", expectedOutput: "11111111" },
    ],
    starter: { ...base, name: "高难 2：一进制翻倍", input: "111", blankSymbol: "□", initialState: "seek", rules: "# 可使用 X 标记原输入、Y 标记复制出的 1\n" },
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
      stoppedState: machine.currentState,
      readSymbol: machine.tape.read(machine.headPosition),
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

/**
 * 第 N 关可进入 ⟺ N 的序号 ≤ 最远已完成关的序号 + 1（前沿式）。
 *
 * 原实现要求"前面每一关都已完成"。加入「撤销通关」后，完成集合可能出现空洞，
 * 按原规则会把玩家已经走到的后续关卡重新锁死（例如完成 1–5 关后撤销第 3 关，
 * 第 4、5 关会一并变锁）。前沿式对空洞天然容错，同时仍只允许"一次推进一关"。
 */
export function isLevelUnlocked(progress: CampaignProgress, levelId: string): boolean {
  const index = campaignLevels.findIndex((level) => level.id === levelId);
  if (index < 0) return false;
  const frontier = campaignLevels.reduce(
    (max, level, position) =>
      progress.completedLevelIds.includes(level.id) ? Math.max(max, position) : max,
    -1,
  );
  return index <= frontier + 1;
}

export function completeLevel(progress: CampaignProgress, levelId: string): CampaignProgress {
  if (!isLevelUnlocked(progress, levelId) || progress.completedLevelIds.includes(levelId)) return progress;
  return { ...progress, completedLevelIds: [...progress.completedLevelIds, levelId] };
}

/** 撤销某关的通关状态（回到「学习中」）。该关未完成时原样返回。 */
export function uncompleteLevel(progress: CampaignProgress, levelId: string): CampaignProgress {
  if (!progress.completedLevelIds.includes(levelId)) return progress;
  return {
    ...progress,
    completedLevelIds: progress.completedLevelIds.filter((id) => id !== levelId),
  };
}

/** 删除某关草稿；渲染时会回落到该关的初始提示。该关没有草稿时原样返回。 */
export function resetDraft(progress: CampaignProgress, levelId: string): CampaignProgress {
  if (!Object.prototype.hasOwnProperty.call(progress.drafts, levelId)) return progress;
  const drafts = { ...progress.drafts };
  delete drafts[levelId];
  return { ...progress, drafts };
}
