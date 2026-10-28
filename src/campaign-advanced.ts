import type { CampaignLevel } from "./campaign";

const base = { description: "根据原理完成本关规则。", blankSymbol: "□", acceptStates: "", rejectStates: "", haltStates: "HALT" };
const unary = (value: number) => "1".repeat(value);
const pairs = (operator: string, values: number[][]) => values.map(([a, b, answer]) => ({ input: `${unary(a)}${operator}${unary(b)}`, expectedOutput: unary(answer) }));
const starter = (name: string, input: string, initialState: string, rules: string) => ({ ...base, name, input, initialState, rules });

export const advancedCampaignLevels: CampaignLevel[] = [
  {
    id: "function-wrap", section: "tutorial", difficulty: 1, title: "把扫描装进函数",
    objective: "在函数里完成一进制加一，再用函数名启动。",
    concept: "函数的初始状态、完成状态与调用入口。",
    lesson: {
      explanation: "函数把一组转移规则包装起来。进入函数时从括号里的第一个状态启动；到第二个状态时正常完成，回到调用位置下面。状态名称会在内部隔离。",
      steps: ["保留 q0 扫过 1 的循环。", "补上 q0 读取 □：写 1、到 done、右移。", "顶格写 追加 调用，最后一次完成后停机。"],
      syntax: ["追加(q0,done):", "函数体缩进四个空格", "初始状态可填函数名"],
      workedExample: { title: "111 加一的调用过程", stages: ["调用 追加 → 进入该次调用的 q0", "读过 3 个 1 → 到达 □", "写 1 → done → 调用行下面 → HALT"] },
    },
    starter: starter("函数入门", "111", "追加", "追加(q0,done):\n    q0,1 -> q0,1,R\n\n追加"),
    cases: [0, 1, 3].map(n => ({ input: unary(n), expectedOutput: unary(n + 1) })), maxSteps: 20,
  },
  {
    id: "function-sequence", section: "tutorial", difficulty: 1, title: "调用位置的下一行",
    objective: "复用同一个追加函数，让每组输入都增加两个 1。",
    concept: "正常完成后续行，重复调用有独立内部状态。",
    lesson: {
      explanation: "函数正常完成不会强制跳到外面同名的 done。它会回到调用它的位置，继续下一行；所以可以连续调用同一函数。",
      steps: ["阅读已经写好的追加函数。", "在第一次顶格调用下面再写一次函数名。", "用空串和不同长度验证，不要只改示例输入。"],
      syntax: ["调用只写函数名", "不需要 ret，也不用函数名后缀"],
      workedExample: { title: "两次调用怎样续接", stages: ["111 → 第一次追加 → 1111", "回到第一次调用下面 → 第二次追加", "1111 → 11111 → HALT"] },
    },
    starter: starter("连续调用", "11", "追加", "追加(q0,done):\n    q0,1 -> q0,1,R\n    q0,□ -> done,1,R\n\n追加"),
    cases: [0, 1, 3].map(n => ({ input: unary(n), expectedOutput: unary(n + 2) })), maxSteps: 24,
  },
  {
    id: "function-conditional", section: "tutorial", difficulty: 2, title: "下一状态也能调用函数",
    objective: "翻转输入的单个二进制位，再在右侧写 1。",
    concept: "条件规则调用普通函数，完成后回到调用位置续行。",
    lesson: {
      explanation: "把函数名写在下一状态位置同样可以调用，不要求函数带 ret。条件规则先完成本次读写，再进入函数；函数正常完成后执行调用位置下面的阶段。",
      steps: ["flip 的 0 分支已写好。", "补上读取 1 时写 0、右移并完成的分支。", "检查外部 after 能在函数完成后写出末尾 1。"],
      syntax: ["start,1 -> flip,1,N", "普通函数可以出现在下一状态列"],
      workedExample: { title: "输入 1", stages: ["start 调用 flip", "flip 把 1 改成 0，并向右移动", "回到调用后面的 after → 写 1 → 输出 01"] },
    },
    starter: starter("条件调用", "1", "start", "flip(q0,done):\n    q0,0 -> done,1,R\n\nstart,0 -> flip,0,N\nstart,1 -> flip,1,N\nafter,□ -> HALT,1,N"),
    cases: [{ input: "0", expectedOutput: "11" }, { input: "1", expectedOutput: "01" }], maxSteps: 10,
  },
  {
    id: "function-ret", section: "tutorial", difficulty: 2, title: "需要跳出时才写 ret",
    objective: "输入 0 输出 00，输入 1 输出 11；只让 0 分支跳到外部 outside。",
    concept: "函数内部声明 ret，达到该状态才返回。",
    lesson: {
      explanation: "ret outside 声明一个显式返回点。只有执行到 outside 的路径才跳到外部同名状态；另一条路径到 done 正常完成，继续调用位置下面。",
      steps: ["观察函数两个分支的下一状态：outside 与 done。", "在函数体内加入 ret outside。", "分别验证两组输入，确保普通完成没有被误当成返回。"],
      syntax: ["ret outside 必须缩进在函数内", "ret 控制返回；导出状态用于公开名称"],
      workedExample: { title: "两条路径", stages: ["0 → outside → 外部 outside 写 0 → 00", "1 → done → 调用后面的 next 写 1 → 11"] },
    },
    starter: starter("显式返回", "0", "start", "选择(q0,done):\n    q0,0 -> outside,0,R\n    q0,1 -> done,1,R\n\nstart,0 -> 选择,0,N\nstart,1 -> 选择,1,N\nnext,□ -> HALT,1,N\noutside,□ -> HALT,0,N"),
    cases: [{ input: "0", expectedOutput: "00" }, { input: "1", expectedOutput: "11" }], maxSteps: 10,
  },
  {
    id: "unary-addition", section: "tutorial", difficulty: 2, title: "加法：合并两段计数",
    objective: "计算 1 的个数之和，例如 111+11 变成 11111。",
    concept: "先合并，再修正分隔符多算的一格。",
    lesson: {
      explanation: "一进制的数值就是 1 的数量。把 + 改成 1 可以连接两段，却会多出一个 1；所以还要找到末尾，擦掉最后一格。",
      steps: ["scan 越过左操作数。", "读到 + 时写 1 并进入 end。", "end 扫到 □ 后左移到 trim。", "trim 擦掉最后的 1 并停机。"],
      syntax: ["空操作数表示 0", "+ 不是数值的一部分"],
      workedExample: { title: "3 + 2", stages: ["111+11 → 把 + 写成 1 → 111111", "目前是 6 个 1，多算了分隔符", "擦掉末位 → 11111（5）"] },
    },
    starter: starter("一进制相加", "111+11", "add.scan", "add.scan,1 -> add.scan,1,R\nadd.scan,+ -> add.end,1,R"),
    cases: pairs("+", [[0, 0, 0], [0, 2, 2], [2, 0, 2], [3, 2, 5]]), maxSteps: 40,
  },
  {
    id: "multiply-as-addition", section: "tutorial", difficulty: 3, title: "乘法：重复相加",
    objective: "把左边的一进制数乘以 2，例如 111*11 输出 111111。",
    concept: "乘数控制复制次数，临时标记区分原数与结果。",
    lesson: {
      explanation: "a×2 是把 a 加两次，不是只追加两个 1。图灵机用 X/Y 标记已经读取的计数，把结果写在 = 右侧；最后清除输入与工作标记。",
      steps: ["在右操作数后写 =，分开输入和输出。", "标记一个左侧 1，遍历右侧两个 1，各追加一个输出。", "还原右侧临时标记，再处理下一个左侧 1。", "清理 X、*、=，只保留答案。"],
      syntax: ["X 标记左操作数；Y 标记当前右操作数", "最终输出不能残留工作符号"],
      workedExample: { title: "3 × 2 的数值原理", stages: ["结果先为 0", "加第一份 3 → 3", "加第二份 3 → 6", "111*11 → 111111"] },
    },
    starter: starter("重复相加", "111*11", "mul.init", "mul.init,1 -> mul.init,1,R\nmul.init,* -> mul.init,*,R"),
    cases: pairs("*", [[0, 2, 0], [1, 2, 2], [2, 2, 4], [3, 2, 6]]), maxSteps: 1000,
  },
  {
    id: "unary-subtraction", section: "challenge", difficulty: 2, title: "减法：逐对抵消",
    objective: "实现非负一进制减法，左数保证不小于右数。",
    concept: "每消去右边一个 1，就消去左边一个 1。",
    lesson: {
      explanation: "减法把两侧的 1 一一配对。每次标记右侧一个 Y，再向左找到一个未处理的 1 标成 X。右侧用完后清理标记，留下左侧未被配对的部分。",
      steps: ["找到 -，开始选择右侧未处理的 1。", "跨过 - 向左匹配一个 1。", "回到右侧重复。", "清除 X、Y、-，相等时留下空纸带。"],
      syntax: ["本关不处理负数", "空结果表示 0"],
      workedExample: { title: "5 − 2", stages: ["11111−11 → 配掉一对 → 剩余 4−1", "再配掉一对 → 剩余 3−0", "清理工作区 → 111"] },
    },
    starter: starter("逐对相减", "11111-11", "sub.seek", "sub.seek,1 -> sub.seek,1,R\nsub.seek,- -> sub.pick,-,R"),
    cases: pairs("-", [[0, 0, 0], [2, 0, 2], [2, 2, 0], [5, 2, 3]]), maxSteps: 1200,
  },
  {
    id: "unary-product", section: "challenge", difficulty: 3, title: "任意次数的重复相加",
    objective: "把乘以 2 推广到不同的一进制乘数。",
    concept: "两层循环分别管理被乘数和乘数。",
    lesson: {
      explanation: "外层每取走一个左侧计数，内层完整扫描右侧计数并复制到结果区。内层标记必须恢复，否则后面的外层循环会少算。",
      steps: ["复用教程中标记、复制、还原和清理的阶段。", "让内层遍历到分隔边界，不写死两次。", "任一操作数为 0 时仍要清理并正常停机。"],
      syntax: ["a×0=0，0×b=0", "输出应只有连续的 1"],
      workedExample: { title: "2 × 3", stages: ["0 → 加一份 2 → 2", "2 → 再加 2 → 4", "4 → 再加 2 → 6"] },
    },
    starter: starter("通用一进制乘法", "11*111", "mul.init", "mul.init,1 -> mul.init,1,R\nmul.init,* -> mul.init,*,R"),
    cases: pairs("*", [[0, 3, 0], [3, 0, 0], [1, 4, 4], [2, 3, 6], [3, 2, 6]]), maxSteps: 3000,
  },
  {
    id: "unary-square", section: "challenge", difficulty: 3, title: "平方：乘法的过渡关",
    objective: "计算 a²，输入左侧是 a，右侧固定为两个 1。",
    concept: "从结果 1 开始，乘两次底数。",
    lesson: {
      explanation: "a² 是 a×a。把幂看成重复乘法，就可以先练习指数固定为 2 的情况，再推广到任意指数。需要保留底数，不能把它当一次性输入擦掉。",
      steps: ["读取 ^ 两侧的计数，保存底数。", "结果初始化为 1。", "把结果乘以底数两次。", "清理计数器与分隔符。"],
      syntax: ["111^11 表示 3²", "工作区可放在输入左侧"],
      workedExample: { title: "3²", stages: ["结果 1", "乘第一次 3：1×3=3", "乘第二次 3：3×3=9"] },
    },
    starter: starter("一进制平方", "111^11", "BOOT", ""),
    cases: pairs("^", [[0, 2, 0], [1, 2, 1], [2, 2, 4], [3, 2, 9]]), maxSteps: 150000,
  },
  {
    id: "unary-power", section: "hard", difficulty: 3, title: "乘方原理：把乘法放进循环",
    objective: "计算 a^b，包含指数为 0 的情况。",
    concept: "P₀=1；每轮 P←P×a，重复 b 轮。",
    lesson: {
      explanation: "指数 b 表示乘法次数，不是再做一次加法。保存底数 a，用纸带计数器记录还剩几轮，每轮调用乘法并替换旧结果。指数 0 时一轮也不做，答案就是初始值 1。",
      steps: ["结果置 1，复制指数作为轮数计数器。", "计数器非零时减一。", "用乘法计算 a×当前结果，写回结果区。", "计数器为 0 时清理并停机；本课程约定 0^0=1。"],
      syntax: ["^ = 重复相乘", "不能用 a×b 代替 a^b"],
      workedExample: { title: "2³ 与 2×3 的区别", stages: ["2³：1 → 2 → 4 → 8（每轮乘 2）", "2×3：0 → 2 → 4 → 6（每轮加 2）", "2⁰：初始值 1，不进入循环"] },
    },
    starter: starter("一进制乘方", "11^111", "BOOT", ""),
    cases: pairs("^", [[0, 0, 1], [3, 0, 1], [0, 2, 0], [2, 3, 8], [3, 2, 9]]), maxSteps: 200000,
  },
  {
    id: "unary-tetration", section: "hard", difficulty: 3, title: "超幂原理：上一轮结果作指数",
    objective: "计算小规模 a↑↑h，输入使用 ^^。",
    concept: "T₀=1；每轮 T←a^T，幂塔从右向左结合。",
    lesson: {
      explanation: "超幂不是把指数相乘，也不是把上一轮结果再乘 a。每一轮要把整个旧结果作为新的指数，调用完整乘方算法。a↑↑3=a^(a^a)，从幂塔最上面开始算。",
      steps: ["结果初始化为 1，高度作循环次数。", "每轮计算 底数^(旧结果)。", "把乘方结果写回，减少高度计数器。", "高度 0 返回 1；本关底数至少为 1。"],
      syntax: ["11^^111 = 2↑↑3 = 16", "2^(2^2)=16；(2^2)^2 恰好也为16，但一般不能改为左结合"],
      workedExample: { title: "2↑↑3", stages: ["T₀=1", "T₁=2¹=2", "T₂=2²=4", "T₃=2⁴=16；3↑↑3 则为 3²⁷，不是 (3³)³"] },
    },
    starter: starter("一进制超幂", "11^^111", "BOOT", ""),
    cases: pairs("^^", [[2, 0, 1], [3, 1, 3], [2, 2, 4], [2, 3, 16]]), maxSteps: 1000000,
  },
  {
    id: "unary-pentation", section: "hard", difficulty: 3, title: "超超幂原理：上一轮结果作塔高",
    objective: "计算本关的小规模 a↑↑↑n，输入使用 ^^^。",
    concept: "G₀=1；每轮 G←a↑↑G，调用的是超幂。",
    lesson: {
      explanation: "这一层把超幂放进循环：上一轮结果成为下一轮幂塔的高度。底数 2 的前几项是 1、2、4、65536，增长会突然加速。本关只实跑小输入；65536 的推演用于理解，不要求逐格算完它。",
      steps: ["先确保超幂子程序能处理高度 0、1、2。", "结果置 1，次数作外层循环计数器。", "每轮调用 a↑↑旧结果，并保存新的结果。", "底数至少为 1；次数 0 直接输出 1。"],
      syntax: ["^^^ 的内层操作是 ^^", "不要将 a↑↑↑n 当成 a↑↑n"],
      workedExample: { title: "2↑↑↑3 的原理推演", stages: ["G₀=1", "G₁=2↑↑1=2", "G₂=2↑↑2=4", "G₃=2↑↑4=2¹⁶=65536（仅推演，不列为本关实跑输入）"] },
    },
    starter: starter("一进制超超幂", "11^^^11", "BOOT", ""),
    cases: pairs("^^^", [[2, 0, 1], [2, 1, 2], [2, 2, 4], [1, 3, 1], [3, 1, 3]]), maxSteps: 200000,
  },
];
