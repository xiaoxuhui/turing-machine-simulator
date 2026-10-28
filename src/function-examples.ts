import type { ExampleProject } from "./examples";

const defaults = {
  category: "函数教程", input: "", blankSymbol: "□",
  acceptStates: "", rejectStates: "", haltStates: "HALT",
} as const;

/** Progressive examples; every result is produced by ordinary tape transitions. */
export const functionExamples: Record<string, ExampleProject> = {
  functionBasics: {
    ...defaults, name: "函数：定义与单次调用", initialState: "写一",
    description: "第 1 课：括号内依次为初始状态、退出状态，下面缩进四个空格写规则；顶格写函数名调用。空输入运行 1 步输出 1。可把规则中的写入符号 1 改成 2 再试。",
    rules: `# 定义必须顶格；q0 是初始状态，结束是退出状态
写一(q0, 结束):
    q0,□ -> 结束,1,N

# 调用只写名字，不写括号；最后一次调用退出后停机
写一`,
  },
  functions: {
    ...defaults, name: "函数：连续追加两次", input: "111", initialState: "追加",
    description: "第 2 课：顶格调用按从上到下顺序执行。每次进入 结束 自动继续下一次调用，最后 HALT 停机；111 经 5 步变成 11111。再加一行 追加 试试。",
    rules: `# 每次先越过 1，再在第一个空白写 1 并右移
追加(q0, 结束):
    q0,1 -> q0,1,R
    q0,□ -> 结束,1,R

追加
追加`,
  },
  functionReturn: {
    ...defaults, name: "函数：返回外部状态", initialState: "start",
    description: "第 3 课：start 的下一状态写函数名来调用。写入(q0,q1) 退出后继续外面的 q1 规则。空输入 3 步输出 12。本例没有顶格调用列表，入口使用初始状态框的 start。",
    rules: `写入(q0, q1):
    q0,□ -> q1,1,R

# 这一步只调用，不移动；函数写 1 后返回外部 q1
start,□ -> 写入,□,N
q1,□ -> HALT,2,N`,
  },
  functionComposition: {
    ...defaults, name: "函数：组合多个子函数", initialState: "组合",
    description: "第 4 课：初始、退出状态后可以继续列多个子函数；首=写一 是别名，写二 是原名绑定。组合体只写缩进的调用列表，按顺序写出 123，共 3 步。把 首 和 末 的位置互换试试。",
    rules: `# 三个函数都用 q0、结束，内部状态彼此独立
写一(q0, 结束):
    q0,□ -> 结束,1,R

写二(q0, 结束):
    q0,□ -> 结束,2,R

写三(q0, 结束):
    q0,□ -> 结束,3,R

# 前两个是状态，后面绑定已有函数；组合体不混写转移规则
组合(q0, 结束, 首=写一, 写二, 末=写三):
    首
    写二
    末

组合`,
  },
  functionParentReturn: {
    ...defaults, name: "函数：子函数返回父状态", initialState: "主函数",
    description: "第 5 课：子函数退出名 接着 对应父函数内的 接着，执行后继续父函数。父子都使用 q0，实际状态仍隔离。父写 1、子写 2、父写 3，空输入 4 步输出 123。",
    rules: `写二(q0, 接着):
    q0,□ -> 接着,2,R

主函数(q0, 结束, 写=写二):
    q0,□ -> 中间,1,R
    中间,□ -> 写,□,N
    接着,□ -> 结束,3,N

# 子函数退出后回到父函数的 接着，而非重新开始或立刻停机
主函数`,
  },
  functionExportEntry: {
    ...defaults, name: "函数：选择公开状态为入口", initialState: "流程.第二步",
    description: "第 6 课：返回状态 公开多个内部状态，不是立刻返回。此例没有顶格调用，入口在初始状态框：流程.第二步 得到 23（2 步）；改成 流程 得到 123（3 步）；流程.第三步 得到 3（1 步）。",
    rules: `# 从初始状态框选择入口；本例不要添加顶格调用，否则列表会决定入口
流程(q0, HALT):
    q0,□ -> 第二步,1,R
    第二步,□ -> 第三步,2,R
    第三步,□ -> HALT,3,N
    返回状态 第二步, 第三步

# 初始状态：流程.第二步；可改成 流程 或 流程.第三步`,
  },
  functionExportRepeat: {
    ...defaults, name: "函数：公开规则与重复调用", initialState: "写一对",
    description: "第 7 课：函数内部公开 补写，外面用 写一对.补写 补充规则。重复调用时，这条规则会匹配各自的内部副本。空输入 4 步输出 1212；每增加一行 写一对 多输出 12、多运行 2 步。",
    rules: `写一对(q0, 结束):
    q0,□ -> 补写,1,R
    返回状态 补写

# 外部补写公开状态；结束会接回当前调用的后续位置
写一对.补写,□ -> 结束,2,R

写一对
写一对`,
  },
  functionExports: {
    ...defaults, name: "函数：子函数与返回状态", initialState: "主函数",
    description: "第 8 课（综合）：绑定 写=写一，子函数返回父函数 after；返回状态 inside 公开为 主函数.inside，外部补写后继续外部 q1。空输入 5 步输出 1234。",
    rules: `写一(s, after):
    s,□ -> after,1,R

主函数(q0, q1, 写=写一):
    q0,□ -> 写,□,N
    after,□ -> inside,2,R
    返回状态 inside

# 点号访问公开状态；q1 是主函数的外部退出状态
主函数.inside,□ -> q1,3,R
q1,□ -> HALT,4,N

主函数`,
  },
};
