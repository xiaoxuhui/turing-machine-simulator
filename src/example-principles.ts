import { examples } from "./examples";
import { campaignLevels, type CampaignLevel } from "./campaign";

export interface ExamplePrinciple {
  id: string; name: string; category: string; input: string; summary: string;
  steps: string[]; walkthrough: string[]; notes: string[]; levelId?: string; laboratoryUrl: string;
}
interface Explanation { summary: string; steps: string[]; walkthrough: string[]; notes?: string[] }
const fromLevel = (level: CampaignLevel): Explanation => ({
  summary: level.lesson.explanation, steps: level.lesson.steps,
  walkthrough: level.lesson.workedExample?.stages ?? level.cases.map(item => `${item.input || "空纸带"} → ${item.expectedOutput || "空纸带"}`),
  notes: [...level.lesson.syntax, ...(level.lesson.implementationGuide ? [level.lesson.implementationGuide.tape, ...level.lesson.implementationGuide.steps, ...level.lesson.implementationGuide.checkpoints] : [])],
});
const levelAliases: Record<string, string> = {
  unary: "unary-increment", binary: "binary-increment", unaryAdd: "unary-addition", unarySubtract: "unary-subtraction",
  unaryMultiply: "unary-product", unaryPower: "unary-power", unaryTetration: "unary-tetration", unaryPentation: "unary-pentation",
  binaryAdd: "binary-addition", binarySubtract: "binary-subtraction", binaryMultiply: "binary-multiplication",
  binaryDivide: "binary-division", binaryPower: "binary-power", binaryLog: "binary-logarithm",
  unaryRoot: "unary-integer-root", unaryLog: "unary-integer-log",
};
const explanations: Record<string, Explanation> = {
  unaryDivide: {
    summary: "除法用重复减法。商从 0 开始，每完整减掉一次除数，商就加一；不够再减时结束，舍去余数。",
    steps: ["固定区保存除数 B，商 Q=0。", "把 B 复制到本轮计数 T：每从 B 取一个 1，同时向 T 和临时区 C 各写一个 1；随后把 C 搬回 B，恢复 B。", "T 每减一，被除数 A 也减一。T 恰好耗尽时才 Q 加一，开始下一轮。", "若 A 先耗尽，不增加这轮商；清理 A、B、T、C，只输出 Q。"],
    walkthrough: ["7÷2：A=7，Q=0", "完整减三次：A=5,3,1；Q=1,2,3", "剩下 1 不够再减 2 → 只输出 111"],
    notes: ["被除数可以消耗，因为最终只输出商；每轮要用的除数必须恢复。除数 0 拒绝。", "按寄存器边界和编号清理，不能靠“遇到的第一个非零区”猜哪个是结果。"],
  },
  unaryCompare: {
    summary: "每次从左右操作数各取一个 1 配成一对，谁先没有剩余，谁就小。",
    steps: ["左侧选一个 1 标 X，到 ? 右侧选一个 1 标 Y。", "配对后返回左端重复。", "左侧先空且右侧有剩余输出 <；同时空输出 =；右侧先空输出 >。", "清理数字与 X/Y，只写比较符号。"],
    walkthrough: ["111?11 → 配两对 → 左边还剩 1", "清理工作区 → >"],
  },
  unaryEven: {
    summary: "状态记录奇偶，不需要存整个数字。每读一个 1，就在 even 与 odd 之间切换。",
    steps: ["初始 even 表示读过 0 个 1。", "每读一个 1 就换状态并右移，输入不擦除。", "到末尾，even 接受、odd 拒绝。"],
    walkthrough: ["1111：even → odd → even → odd → even", "读到 □ → ACCEPT；111 则 REJECT"],
  },
  palindrome: {
    summary: "将最左侧尚未处理的位与最右侧尚未处理的位配对，逐步向中间收缩。",
    steps: ["记住左位：0 写 X、1 写 Y，状态分别去找 0 或 1。", "扫描到右端，向左跳过已有 X/Y，检查未处理末位。", "不同立即拒绝，相同就标记并返回左端。", "只剩中间一位或全为标记时接受。原数字可能保留为 X/Y，结论看接受或拒绝状态。"],
    walkthrough: ["1001：首尾 1 配对 → Y00Y", "中间 0 配对 → YXXY → ACCEPT；1010 第一对就不相等"],
  },
  fibonacci: {
    summary: "用连续 1 的长度表示一项，0 是分隔符也是空白。每轮复制最后两项，把两份计数接在一起形成下一项。",
    steps: ["空输入先写 1、0、1，得到前两项 1、1。", "较早一项标 X，较新一项标 Y，区分已完成数字与当前工作段。", "每处理一个 X，就恢复为 1，并到末尾追加一个 Y；再把较新一项的计数也追加进去。", "完成该项后移动工作边界，让最后两项成为下一轮输入，持续重复。"],
    walkthrough: ["1，1 → 复制 1+1 → 2", "1，2 → 复制 1+2 → 3；2，3 → 5", "纸带上的完整项为 1、1、11、111、11111……，末尾 X/Y 仍在计算中"],
    notes: ["不会主动停机；数字状态名、原名和提取公共函数的版本表示同一过程。", "分隔 0 不计入项的长度，也不能把未完成的 Y 工作段当成完整下一项。"],
  },
  registerAdder: {
    summary: "这是保留原稿的寄存器加法器。函数组合出初始化、复制、加一、减一和输出阶段，寄存器靠 | 分隔。",
    steps: ["go 在左侧建立寄存器和边界 o。", "copy_m、copy_n 用 X 标记已复制输入，用 succ 把计数写进目标寄存器。", "pred 减少一个操作计数，succ 增加结果，直到控制计数到边界。", "output 按寄存器边界定位答案，擦掉临时标记，留下输出。"],
    walkthrough: ["默认 1+11 → 表示 1+2 → 输出 111", "原稿保留 2,1->3,1,L；11+ 实测输出 1，可用单步继续调试"],
    notes: ["这是用户原稿，保留其全部移动规则；不要将它当作所有输入均已验证的标准加法器。"],
  },
  lambda: {
    summary: "一次 β 归约就是把 (λx.M) N 中属于这次绑定的 x 换成 N，再移除该 λ 与应用外壳。采用最左、最外优先。",
    steps: ["由左至右定位最左最外的可归约应用，识别函数体 M 和实参 N 的范围。", "用隐藏工作标记区分绑定与同名自由变量，只替换这个 λ 绑定的 x。", "复制实参到各个目标位置；若自由变量会被内层 λ 捕获，先给内层绑定名追加数字并同步改它的使用处。", "原地移除本次 λ 与应用结构，整理局部纸带；从最左重新寻找，直到没有 β 红项。"],
    walkthrough: ["(λx.x) A_B12 → 将 x 换成 A_B12 → A_B12", "(λx.λy.x) y：直接替换会错误捕获 y", "先把内层 y 改成 y0 → λy0.x，再代入 → λy0.y"],
    notes: ["完整变量名用空格分隔应用；A–Z、a–z、数字、下划线和点均可出现在名称中。带点绑定名用 λA.B . M 明确分隔点。", "图灵机模式用普通读写规则做归约；直接计算模式直接处理语法树。显示器只解码纸带，不替图灵机算 β 归约。每个名称字符占一格。"],
  },
  brainfuck: {
    summary: "BF 的八种指令先编译成有限的图灵机规则；程序位置由状态记录，当前字节、左右单元和输入输出保存在纸带上。",
    steps: ["+ / - 原地改写当前字节，255 后回到 0，0 减一到 255。", "> / < 切换相邻数据单元，新单元初值为 0。", ", 从输入取一个字节，输入结束取 0；. 追加当前字节到输出区。", "[ 在零值时跳过配对循环，] 在非零时继续循环；其余情况执行后续指令。"],
    walkthrough: ["++++++++[>++++++++<-]>+.：先把第一个单元加到 8", "循环 8 次，每次给第二单元加 8，得到 64", "右移、加一、输出 → 字节 65 → A"],
    notes: ["空白符是 |；UTF-8 解码只负责显示输出字节。图灵机的每一步是底层读写，不等于一条 BF 指令。"],
  },
  goldbach: {
    summary: "对给定的一个不大于 100 的偶数，枚举 p+q=n，并检验 p、q 是否都是素数。",
    steps: ["读取一进制 n，确认 n 为 4～100 的偶数。", "从 p=2 开始划分，另一段长度为 q=n−p。", "用 2～10 的试除计数检验两段；等于试除数本身仍是素数，不能误判。", "都为素数就接受并保留 p+q，否则试下一种划分。"],
    walkthrough: ["10：先试 2+8，8 不是素数", "再试 3+7，两段都是素数 → 111+1111111 → ACCEPT"],
    notes: ["只验证这个有限范围中的给定输入，不是证明整个哥德巴赫猜想。"],
  },
  collatz: {
    summary: "当前二进制数为偶数就除以 2，为奇数就变成 3n+1；到达 1 接受。",
    steps: ["检查正整数输入，并判断是否已经是单个 1。", "偶数末位为 0，去掉末位就是除以 2。", "奇数用逐位进位实现 n+2n+1，再从头检查新数。", "循环到 1；达到手动设置的步数上限只表示尚未算完。"],
    walkthrough: ["110（6）→ 11（3）→ 1010（10）→ 101（5）", "→ 10000（16）→ 1000 → 100 → 10 → 1，接受"],
    notes: ["不能把有限时间未结束当作反例，也不能把一个起点的结果当作全体证明。"],
  },
};

const functionWalkthroughs: Record<string, string[]> = {
  functionBasics: ["调用 写一 → 从 q0 读 □ → 写 1 → 正常完成 → HALT"],
  functions: ["111 → 第一次追加 → 1111 → 第二次追加 → 11111"],
  functionReturn: ["内部 ret q1 → 到达 q1 时跳外部 q1 → 写 2，结果 12", "删掉 ret 则正常续行，写 9，结果 19"],
  functionComposition: ["首=写一、写二、末=写三 → 依次调用 → 123"],
  functionParentReturn: ["父写 1 → 子写 2 → ret 接着 → 父的 接着 写 3 → 123"],
  functionExportEntry: ["入口 流程.第二步 → 写 2、3 → 23；入口 流程 则写 123"],
  functionExportRepeat: ["同一个 写一对 调用两次 → 12 + 12 → 1212"],
  functionExports: ["主函数调用局部别名 → 子函数返回父状态 → 继续父函数 → 1234"],
  functionMixed: ["COPY 内先按条件调用子函数，再从调用位置后面的规则继续 → 输出 11"],
  functionMixedContinue: ["规则写 1 → 两次不同子调用分别写 2、3 → 123"],
  functionStarDefaults: ["*,* 保持读取、不移动；R,* 写字符 R；L,* 写字符 L → RL"],
  functionTypedParameters: ["别名分别绑定符号、状态、函数 → 使用类型确定替换位置 → 13"],
  functionOmittedFields: ["只写目标就原地切换；单个 R/L 优先视为移动；要写 R/L 则补 ,* → 2L"],
  functionStarLiterals: ["写入 ** 表示字符 *，写入 *** 表示字符 ** → 两格显示 ***"],
  functionWildcards: ["输入 A：具体分支优先，输出 A*；输入 Z：通配默认分支，保留 Z"],
  functionNestedNames: ["COPY 的两处 SUCC 各自展开，OTHER 的 SUCC 也独立 → 输出 111", "内部名称包含 COPY.FN.编号.SUCC.状态，编号区分调用位置"],
};

for (const [id, walkthrough] of Object.entries(functionWalkthroughs)) explanations[id] = {
  summary: examples[id].description,
  steps: ["先看函数括号中的入口、退出，再看初始状态选择了哪个入口。", "从入口按读取符号选择转移；目标为函数时进入该次调用的内部状态。", "正常完成后继续调用位置后面的阶段；只有显式 ret 指定的状态才跳到外部或父函数。", "打开“转换后的实际转移规则”，对照调用归属和当前状态逐步观察。"],
  walkthrough, notes: ["函数是规则的复用写法，展开后仍是普通图灵机。局部状态隔离，外部返回状态沿用外部名字。", "R/L 优先作为方向；保持写入用 *。字面星号多写一个 *，如 ** 写一个星号。"],
};
for (const id of ["beaver", "beaver3Steps", "beaver3Ones", "beaver4", "beaver23", "beaver24"]) explanations[id] = {
  summary: "这是固定状态数、固定符号数的一张小规则表。从全空白纸带开始，通过局部重写和往返扫描产生长运行，最后进入停机态。",
  steps: ["输入为空，未写格都读作 0，初始 A。", "用“当前状态+读取符号”选唯一一条规则，写入并移动一格。", "反复执行同一张表，不动态生成新规则。", "到 HALT 后统计执行步数和非空格数，与本例说明核对。"],
  walkthrough: [examples[id].description, "如 2 状态例：A 读 0 → 写 1 右移到 B；B 读 0 → 写 1 左移到 A，然后按现有符号继续。"],
  notes: ["这组输入都是空纸带；更换表或初始输入会得到不同过程。步数冠军和写符号冠军不一定是同一台。"],
};
for (const [id, rank, root] of [
  ["unarySuperRoot", 4, true], ["unarySuperLog", 4, false],
  ["unaryPentaRoot", 5, true], ["unaryPentaLog", 5, false],
] as const) {
  const forward = rank === 4 ? "a↑↑n" : "a↑↑↑n";
  explanations[id] = {
    summary: `${examples[id].description} 实际算法保留上限，递增候选并有界试算正向运算。`,
    steps: ["固定区保存输入次数/底数和上限 x，答案寄存器初值为 0。", `候选从 1 开始；${root ? `固定 n，枚举底数 a，试算 ${forward}` : `固定底数 a，枚举次数 n，试算 ${forward}`}。`, "在每次乘积增加前检查剩余预算；一旦正向值必然超过 x，立即退出本次试算，不生成巨大完整结果。", "没有超过就更新答案并试下一个候选；首次超过后按寄存器编号清理，只留下上次答案。"],
    walkthrough: root ? ["输入 2 和 5：底数 1 的正向值为 1，底数 2 的正向值为 4", "底数 3 的正向值超过 5 → 返回 2，纸带 11"] : ["输入底数 2、上限 5：次数 1 得 2，次数 2 得 4", "次数 3 的正向值超过 5 → 返回 2，纸带 11"],
    notes: ["此处的一进制逆运算使用试算算法；不要误认为程序一定在做重复除法。", "乘方 P₀=1，Pₖ₊₁=Pₖ×a；超幂 T₀=1，Tₖ₊₁=a^Tₖ；超超幂 G₀=1，Gₖ₊₁=a↑↑Gₖ。", "复制计数时同时写到目标与临时区，再把临时区搬回源；下一层运算只消耗副本。"],
  };
}

export const examplePrinciples: ExamplePrinciple[] = Object.entries(examples).map(([id, project]) => {
  const levelId = project.campaignLevelId ?? levelAliases[id];
  const level = campaignLevels.find(item => item.id === levelId);
  const explanation = level ? fromLevel(level) : explanations[id];
  if (!explanation) throw new Error(`缺少示例原理：${id}`);
  return { id, name: project.name, category: project.category ?? "基础示例", input: project.input,
    ...explanation, notes: explanation.notes ?? [], levelId,
    laboratoryUrl: `./?example=${encodeURIComponent(id)}` };
});
examplePrinciples.push(
  { id: "gijswijt-tool", name: "吉斯维杰特数列生成器", category: "生成器", input: "整数阈值，例如 2",
    summary: "从 1 开始。对当前序列找最长重复后缀 Y^k，把最大的重复次数 k 作为下一项。Y 可长可短，不是只数相同的最后一位。",
    steps: ["枚举非空后缀块 Y。", "从尾部向前逐块比较，统计连续重复次数。", "在所有块的重复次数中取最大值 k，追加 k。", "对新序列重复，写出的项超过指定阈值才停机。"],
    walkthrough: ["1 → 11（后缀 1 只重复 1 次）", "11 → 112（1 重复 2 次）；112 → 1121", "112112 的后缀块 112 连续重复 2 次，所以还要考虑长度大于 1 的块"],
    notes: ["直接计算和普通图灵机规则两种模式执行同一定义；阈值限制可写整数，超过阈值的项也会显示。"], laboratoryUrl: "./#gijswijtTitle" },
  { id: "universal-tool", name: "通用图灵机", category: "生成器", input: "被模拟机器的规则、初始纸带与初始/终止状态",
    summary: "把另一台机器的规则表和配置写成纸带数据，解释器本身仍是一台固定规则的图灵机。",
    steps: ["编码目标规则、纸带、读写头和当前状态；转义分隔符以保留原字符。", "找到目标读写头的符号，在编码规则表中寻找对应状态和读取符号。", "改写目标纸带，更新目标状态与头位置。", "检查目标停止、接受或拒绝状态，输出目标纸带和结论；否则继续。"],
    walkthrough: ["目标规则 q0,|->H,1,N；输入空 → 解释器找到 q0 与 |", "写入 1、状态 H、头不动 → 输出 1，状态为停止"],
    notes: ["解释器可能用许多底层步骤模拟目标的一步；它是在解释规则数据，不是让 JavaScript 代算目标结果。"], laboratoryUrl: "./#universalTitle" },
);
