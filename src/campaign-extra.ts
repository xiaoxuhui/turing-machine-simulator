import type { CampaignLevel, CampaignSectionId } from "./campaign";
import type { ExampleProject } from "./examples";
import { binaryExamples } from "./binary-examples";
import { unaryExamples } from "./unary-examples";
import { inverseOperationExamples } from "./inverse-operation-examples";

interface LessonSpec {
  id: string; title: string; section: CampaignSectionId; concept: string;
  explanation: string; steps: string[]; stages: string[];
  pairs: Array<[string, string]>; rules: string; initial?: string; project?: ExampleProject;
  maxSteps?: number;
}
const scan = "scan,0->scan,0,R\nscan,1->scan,1,R\n";
const carry = scan + "scan,□->carry,□,L\ncarry,0->HALT,1,N\ncarry,1->carry,0,L\ncarry,□->HALT,1,N";
const borrow = scan + "scan,□->borrow,□,L\nborrow,0->borrow,1,L\nborrow,1->HALT,0,N";
const lessonSpecs: LessonSpec[] = [
  {
    id: "binary-place-zero", title: "位权：末尾添 0", section: "tutorial", concept: "左移一位，就是乘以 2。",
    explanation: "二进制从右往左的位权依次是 1、2、4、8。末尾添一个 0 后，每个旧数字的位权都翻倍。这里先保留输入位数，不清理前导零。",
    steps: ["scan 越过每个 0 和 1。", "遇到 □ 就写 0 并停机。", "按位权检查 11 和 110 分别是 3 和 6。"],
    stages: ["11 = 2+1 = 3", "末尾添 0 → 110 = 4+2 = 6"],
    pairs: [["0", "00"], ["1", "10"], ["11", "110"], ["101", "1010"]], rules: scan + "scan,□->HALT,0,N",
  },
  {
    id: "binary-place-one", title: "位权：末尾添 1", section: "tutorial", concept: "左移再加一，就是 2n+1。",
    explanation: "末尾添 1 与上一关只差一个写入符号。旧位仍然全部翻倍，新添的最低位再贡献 1。无需把二进制先转换成一串计数。",
    steps: ["扫描到输入右端。", "在空白格写 1。", "分别检查偶数、奇数和 0。"],
    stages: ["10 是 2", "添 1 → 101 是 5 = 2×2+1"],
    pairs: [["0", "01"], ["1", "11"], ["10", "101"], ["101", "1011"]], rules: scan + "scan,□->HALT,1,N",
  },
  {
    id: "binary-carry-local", title: "加一：先不进位", section: "tutorial", concept: "最低位是 0 时，把它变成 1 就结束。",
    explanation: "先把加一限制在偶数输入。找到右端后左移一格，读到的最低位一定是 0，只需改成 1；高位不受影响。",
    steps: ["scan 扫描 0 和 1。", "遇到 □ 时左移并进入 last。", "last 把 0 改成 1 后停机。"],
    stages: ["1010 → 找到最右边的 0", "仅改末位 → 1011"],
    pairs: [["0", "1"], ["10", "11"], ["100", "101"], ["1010", "1011"]],
    rules: scan + "scan,□->last,□,L\nlast,0->HALT,1,N",
  },
  {
    id: "binary-carry-chain", title: "加一：连续进位", section: "tutorial", concept: "遇到 1 写 0，进位继续往左。",
    explanation: "carry 状态本身就代表还有一个进位。读到 1 时，1+1=10，当前格写 0、向左继续 carry；读到 0 时写 1 并结束。越过最高位时，在空白处写一个新的 1。",
    steps: ["先扫描到右端。", "把连续的末尾 1 改成 0。", "遇到 0 或 □ 写 1，进位结束。"],
    stages: ["1011 → 1010 → 1000：每次都还有进位", "遇到 0 写 1 → 1100；111 则变为 1000"],
    pairs: [["1", "10"], ["11", "100"], ["1011", "1100"], ["1111", "10000"]], rules: carry,
  },
  {
    id: "binary-borrow-local", title: "减一：先不借位", section: "tutorial", concept: "最低位是 1 时，把它变成 0。",
    explanation: "奇数的最低位是 1。减一只需将这一个 1 写成 0，不需要向高位借位。此练习保留位数，所以 1 的结果写作 0。",
    steps: ["找到右侧空白。", "左移进入 last。", "把末位 1 写成 0。"],
    stages: ["1011 → 末位是 1", "写 0 → 1010"],
    pairs: [["1", "0"], ["11", "10"], ["101", "100"], ["1011", "1010"]],
    rules: scan + "scan,□->last,□,L\nlast,1->HALT,0,N",
  },
  {
    id: "binary-borrow-chain", title: "减一：穿过连续的 0", section: "tutorial", concept: "读到 0 写 1，借位继续往左。",
    explanation: "borrow 状态代表还欠一个 1。当前位为 0 时，把它写成 1 并向左继续借；遇到 1 时写成 0，借位结束。只接收正数，暂时保留前导零。",
    steps: ["右端回退到最低位。", "borrow 把经过的 0 写成 1。", "把第一个 1 写成 0 并结束。"],
    stages: ["1000 → 1001 → 1011 → 1111：中间仍欠 1", "最高位 1 还债 → 0111"],
    pairs: [["10", "01"], ["100", "011"], ["1000", "0111"], ["10100", "10011"]], rules: borrow,
  },
  {
    id: "binary-parity-bit", title: "只看末位判断奇偶", section: "tutorial", concept: "最低位为 0 是偶数，为 1 是奇数。",
    explanation: "除了最低位以外，所有位的位权都是 2 的倍数。扫描到右端，记住末位，再向左擦除旧输入，最后写出这个奇偶位。",
    steps: ["scan 找到最后一位。", "读到 0 进入 even，读到 1 进入 odd，同时擦除该位。", "向左清理，左边界只写 0 或 1。"],
    stages: ["1101 → 末位 1 → 状态 odd", "擦除原输入 → 写 1，表示奇数"],
    pairs: [["0", "0"], ["1", "1"], ["1010", "0"], ["1101", "1"]],
    rules: scan + "scan,□->last,□,L\nlast,0->even,□,L\nlast,1->odd,□,L\neven,0->even,□,L\neven,1->even,□,L\nodd,0->odd,□,L\nodd,1->odd,□,L\neven,□->HALT,0,N\nodd,□->HALT,1,N",
  },
  {
    id: "binary-shift-right", title: "去掉末位：整除 2", section: "tutorial", concept: "右移一位，余数舍去。",
    explanation: "去掉最低位后，每个保留下来的位权减半，因此得到向下取整的 n÷2。若去掉后一个数字也没有，必须补写 0，不能留下空纸带。",
    steps: ["扫描到末位并擦除它。", "左移检查是否还剩数字。", "有数字就停机，没有就写 0。"],
    stages: ["1101 → 擦掉最低位 1 → 110（13÷2 取整为 6）", "1 → 擦掉后为空 → 补写 0"],
    pairs: [["0", "0"], ["1", "0"], ["10", "1"], ["1101", "110"]],
    rules: scan + "scan,□->trim,□,L\ntrim,0->check,□,L\ntrim,1->check,□,L\ncheck,0->HALT,0,N\ncheck,1->HALT,1,N\ncheck,□->HALT,0,N",
  },
  {
    id: "copy-with-divider", title: "复制：原数与副本分区", section: "challenge", concept: "标记原数，输出区单独追加，最后还原。",
    explanation: "先在原输入末尾写 #。每次只从 # 左侧选一个 1 标成 X，到最右端追加一个 1；新写的数字在 # 右侧，不会被当作尚未复制的原数。",
    steps: ["写 # 并返回原输入左端。", "标记一个原始 1，去副本末尾追加 1。", "返回左端继续，直到遇到 #。", "把左侧 X 还原为 1，保留 # 和副本。"],
    stages: ["11 → 11# → X1#1", "XX#11 → 还原 X → 11#11"],
    pairs: [["", "#"], ["1", "1#1"], ["11", "11#11"], ["111", "111#111"]], initial: "boot",
    rules: "boot,1->boot,1,R\nboot,□->back,#,L\nback,1->back,1,L\nback,□->pick,□,R\npick,X->pick,X,R\npick,1->end,X,R\npick,#->restore,#,L\nend,1->end,1,R\nend,X->end,X,R\nend,#->end,#,R\nend,□->home,1,L\nhome,1->home,1,L\nhome,X->home,X,L\nhome,#->home,#,L\nhome,□->pick,□,R\nrestore,X->restore,1,L\nrestore,□->HALT,□,N", maxSteps: 300,
  },
  {
    id: "unary-times-three", title: "从乘二过渡到乘三", section: "challenge", concept: "每选一个左侧计数，输出三个 1。",
    explanation: "乘法并不写死为乘二。左操作数每标记一个 1，就遍历右侧三个 1，各追加一个输出；还原右侧标记后继续。",
    steps: ["用 = 分隔工作区和结果区。", "标记左侧一个 1，右侧每个 1 对应追加一次。", "还原右侧，处理下一个左侧计数。", "擦除输入和标记，只保留结果。"],
    stages: ["11*111 → 第一轮输出 111", "第二轮再输出 111 → 111111"],
    pairs: [["*111", ""], ["1*111", "111"], ["11*111", "111111"], ["111*111", "111111111"]],
    project: unaryExamples.unaryMultiply, rules: unaryExamples.unaryMultiply.rules, maxSteps: 10000,
  },
  {
    id: "binary-trim-zeros", title: "清理前导零，留下唯一的零", section: "challenge", concept: "用状态记录“还没有遇到第一个 1”。",
    explanation: "从左到右擦掉前导 0。遇到第一个 1 后保留整个剩余输入；若全是 0，在末端补写一个 0。停机时数字可能不在位置 0，但值和连续输出必须正确。",
    steps: ["trim 读到 0 就擦除并右移。", "遇到 1 立即停机，后续数字原样保留。", "遇到 □ 说明全为 0，写一个 0。"],
    stages: ["000101 → □□□101 → 输出 101", "000 → 全擦除 → 写 0"],
    pairs: [["0", "0"], ["000", "0"], ["00101", "101"], ["101", "101"]], initial: "trim",
    rules: "trim,0->trim,□,R\ntrim,1->HALT,1,N\ntrim,□->HALT,0,N",
  },
  {
    id: "binary-addition", title: "二进制加法：多一个进位状态", section: "challenge", concept: "a 位+b 位+进位，得到当前位和下一进位。",
    explanation: "从低位对齐两个数，不足的高位当 0。一次只计算 a+b+c：结果的奇偶决定本位，是否达到 2 决定下次进位。实际示例把数位保存到纸带栈，用有限状态保存 c。",
    steps: ["按 + 分开输入，把最低位放到可取出的位置。", "逐位相加，将和模 2 写入结果区。", "和达到 2 就进入进位状态，否则进入无进位状态。", "处理最后进位，反向输出并清理。"],
    stages: ["101+11：低位 1+1=10 → 写 0，进位 1", "中位 0+1+1=10 → 写 0，进位 1", "高位 1+0+1=10 → 写 0，最后补 1 → 1000"],
    pairs: [["0+0", "0"], ["1+1", "10"], ["101+11", "1000"], ["111+1", "1000"]], project: binaryExamples.binaryAdd, rules: binaryExamples.binaryAdd.rules,
  },
  {
    id: "binary-subtraction", title: "二进制减法：逐位还借位", section: "challenge", concept: "a 位−b 位−借位；小于 0 就借 2。",
    explanation: "每轮计算 d=a−b−c。若 d 为负，本位写 d+2，并让下一高位再减一；否则直接写 d、清除借位。课程测试均为非负结果。",
    steps: ["从最低位取左右两位。", "计算当前差以及是否借位。", "把差保存到结果区，继续高位。", "清除前导零与临时区，零输出单个 0。"],
    stages: ["100−1：低位 0−1 → 写 1，借 1", "中位 0−0−1 → 写 1，继续借", "高位 1−0−1=0 → 011 → 输出 11"],
    pairs: [["0-0", "0"], ["100-1", "11"], ["1000-11", "101"], ["101-101", "0"]], project: binaryExamples.binarySubtract, rules: binaryExamples.binarySubtract.rules,
  },
  {
    id: "binary-multiplication", title: "二进制乘法：移位再相加", section: "challenge", concept: "乘数为 1 的位才需要累加。",
    explanation: "从乘数最低位开始：读到 1 就把当前被乘数副本加到结果，读到 0 就略过加法；每处理一位，被乘数左移一位。被乘数与结果分区保存。",
    steps: ["结果置 0，取乘数最低位。", "位为 1 时复制当前被乘数并相加。", "被乘数末尾添 0，相当于乘 2。", "乘数耗尽后清理并输出。"],
    stages: ["101×11：结果 0，第一位 1 → 加 101", "被乘数移位成 1010，第二位 1 → 101+1010=1111"],
    pairs: [["0*11", "0"], ["1*1", "1"], ["101*11", "1111"], ["10*11", "110"]], project: binaryExamples.binaryMultiply, rules: binaryExamples.binaryMultiply.rules,
  },
  {
    id: "binary-division", title: "二进制除法：每次写一位商", section: "challenge", concept: "余数移位添下一位，然后试减除数。",
    explanation: "从被除数最高位开始。余数先乘 2 加上新读入位，再试减除数。够减就保留差、商添 1；不够减就保留原余数、商添 0。试减用副本，不破坏原余数。",
    steps: ["保存除数，余数和商从 0 开始。", "将被除数下一位并入余数。", "复制余数与除数试减，按是否借位选商位。", "读完后输出商，本关舍去余数。"],
    stages: ["1101÷11：每轮结束的余数为 1、0、0、1", "逐位商 0、1、0、0 → 去前导零 → 100（余 1）"],
    pairs: [["0/1", "0"], ["10/11", "0"], ["1101/11", "100"], ["110/10", "11"]], project: binaryExamples.binaryDivide, rules: binaryExamples.binaryDivide.rules,
  },
  {
    id: "function-nested-repeat", title: "父函数里重复调用同一子函数", section: "challenge", concept: "每个调用位置独立展开，名称包含父子层级。",
    explanation: "pair 写 12；copy 在两个不同位置调用 pair，就得到 1212。每次调用都有独立内部状态，正常完成续行，不需要显式 ret。",
    steps: ["实现 pair：先写 1 右移，再写 2 右移。", "copy 中缩进写两次 pair。", "顶格调用 copy，检查展开名称包含 copy 和 pair。"],
    stages: ["copy → 第一次 pair → 12", "回到 copy 下一行 → 第二次 pair → 1212"],
    pairs: [["", "1212"]], initial: "copy",
    rules: "pair(q0,done):\n    q0,□->q1,1,R\n    q1,□->done,2,R\ncopy(q0,done):\n    pair\n    pair\ncopy",
  },
  {
    id: "binary-power", title: "二进制乘方：平方并按位乘", section: "hard", concept: "指数从高位读：旧指数翻倍，再加当前位。",
    explanation: "先令结果为 1。指数每读一位，先把结果平方；如果这一位是 1，再乘底数。因为 a^(2k+b)=(a^k)^2×a^b。",
    steps: ["保存底数和二进制指数，结果置 1。", "读指数下一高位，复制结果并做平方。", "该位为 1 再乘底数，为 0 就跳过。", "指数读完后输出。"],
    stages: ["11^11 即 3³：结果 1 → 第一位 1：1²×3=3", "第二位 1：3²×3=27 → 二进制 11011"],
    pairs: [["10^0", "1"], ["0^1", "0"], ["10^11", "1000"], ["11^10", "1001"]], project: binaryExamples.binaryPower, rules: binaryExamples.binaryPower.rules,
  },
  {
    id: "binary-logarithm", title: "二进制对数：重复整数除法", section: "hard", concept: "每次除以固定底数，统计非零商出现的次数。",
    explanation: "底数必须至少为 2，真数至少为 1。反复计算整数商；商非零时计数加一，并把商作为新的真数；第一次商为 0 就停止。计数即向下取整的对数。",
    steps: ["保留底数，计数置 0。", "做一次长除法。", "商非零：替换真数、计数加一。", "商为 0：清理并输出计数。"],
    stages: ["13÷2=6 → 计数 1；6÷2=3 → 计数 2", "3÷2=1 → 计数 3；1÷2=0 → 停止，输出 11"],
    pairs: [["10@1", "0"], ["10@1000", "11"], ["10@1101", "11"], ["11@1001", "10"]], project: binaryExamples.binaryLog, rules: binaryExamples.binaryLog.rules,
  },
  {
    id: "unary-integer-root", title: "整数开根：保留输入再试算", section: "hard", concept: "逐个试底数，第一次超过就返回前一个。",
    explanation: "n~x 求最大的整数 a，使 a^n≤x。把 n、x 放在固定区，答案初值为 0，候选从 1 递增；复制候选进行乘方和比较，试算不能消耗固定的 n、x。",
    steps: ["保存次数 n、上限 x，答案置 0。", "计算候选的 n 次方。", "不超过 x 就保存答案，再试候选加一。", "第一次超过时清理，只留下上次答案。"],
    stages: ["2~5：1²、2² 都≤5", "3²=9>5 → 返回上个候选 2，输出 11"],
    pairs: [["11~", ""], ["11~1111", "11"], ["11~11111", "11"], ["111~11111111", "11"]], project: inverseOperationExamples.unaryRoot, rules: inverseOperationExamples.unaryRoot.rules,
  },
  {
    id: "unary-integer-log", title: "整数对数：试幂找边界", section: "hard", concept: "固定底数，找最后一个没有超过真数的指数。",
    explanation: "本例采用有界试幂，而不是二进制示例的重复除法。保存底数 a 和真数 x，答案初值为 0，候选指数从 1 开始试算 a^k；首次超过 x 时，返回上个答案。",
    steps: ["检查 a≥2、x≥1，答案置 0。", "用独立副本计算候选次方。", "与保存的 x 比较，不超过就试下一个指数。", "首次超过，输出上一次成功候选。"],
    stages: ["2@5：2¹=2、2²=4 都≤5", "2³=8>5 → 返回 2，输出 11"],
    pairs: [["11@1", ""], ["11@1111", "11"], ["11@11111", "11"], ["111@111111111", "11"]], project: inverseOperationExamples.unaryLog, rules: inverseOperationExamples.unaryLog.rules,
  },
];

export const extraCampaignSolutions: Record<string, string> = Object.fromEntries(lessonSpecs.map(spec => [spec.id, spec.rules]));
export const extraCampaignLevels: CampaignLevel[] = lessonSpecs.map(spec => ({
  id: spec.id, title: spec.title, section: spec.section,
  difficulty: spec.section === "tutorial" ? 1 : spec.section === "hard" ? 3 : 2,
  objective: `完成${spec.title}；例如 ${spec.pairs.at(-1)![0] || "空纸带"} 输出 ${spec.pairs.at(-1)![1] || "空纸带"}。`,
  concept: spec.concept,
  lesson: { explanation: spec.explanation, steps: spec.steps,
    syntax: [spec.id.startsWith("binary-") ? "0 是数字，□ 是空白，两者不同。" : "初始状态决定入口；HALT 表示普通停机。", "输入与输出按字符读取；停机前清理本题不需要的工作标记。"],
    workedExample: { title: spec.title, stages: spec.stages } },
  starter: { ...spec.project, name: spec.title, description: spec.explanation,
    input: spec.pairs.at(-1)![0], blankSymbol: spec.project?.blankSymbol ?? "□",
    initialState: spec.project?.initialState ?? spec.initial ?? "scan",
    haltStates: spec.project?.haltStates ?? "HALT", acceptStates: "", rejectStates: "",
    rules: `# ${spec.concept}\n# ${spec.steps[0]}\n${spec.section === "tutorial" ? "scan,0->scan,0,R\n# 继续补上读取 1 和 □ 的规则\n" : ""}` },
  cases: spec.pairs.map(([input, expectedOutput]) => ({ input, expectedOutput })),
  maxSteps: spec.maxSteps ?? (spec.project ? 2_000_000 : 100),
}));
