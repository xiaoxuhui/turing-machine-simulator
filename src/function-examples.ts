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
    rules: `写一(q0, 结束):
    q0,□ -> 结束,1,N

写一`,
  },
  functions: {
    ...defaults, name: "函数：连续追加两次", input: "111", initialState: "追加",
    description: "第 2 课：顶格调用按从上到下顺序执行。每次进入 结束 自动继续下一次调用，最后 HALT 停机；111 经 5 步变成 11111。再加一行 追加 试试。",
    rules: `追加(q0, 结束):
    q0,1 -> q0,1,R
    q0,□ -> 结束,1,R

追加
追加`,
  },
  functionReturn: {
    ...defaults, name: "函数：返回外部状态", initialState: "start",
    description: "第 3 课：函数内写 ret q1，执行到 q1 才跳到外面的 q1，3 步输出 12。删掉 ret q1 就正常续行到 下一行，3 步输出 19。初始状态填 start；函数名不用加下划线。",
    rules: `写入(q0, q1):
    q0,□ -> q1,1,R
    ret q1

start,□ -> 写入
下一行,□ -> HALT,9,N
q1,□ -> HALT,2,N`,
  },
  functionComposition: {
    ...defaults, name: "函数：组合多个子函数", initialState: "组合",
    description: "第 4 课：初始、退出状态后可以继续列多个子函数；首=写一 是别名，写二 是原名绑定。组合体只写缩进的调用列表，按顺序写出 123，共 3 步。把 首 和 末 的位置互换试试。",
    rules: `写一(q0, 结束):
    q0,□ -> 结束,1,R

写二(q0, 结束):
    q0,□ -> 结束,2,R

写三(q0, 结束):
    q0,□ -> 结束,3,R

组合(q0, 结束, 首=写一, 写二, 末=写三):
    首
    写二
    末

组合`,
  },
  functionParentReturn: {
    ...defaults, name: "函数：子函数返回父状态", initialState: "主函数",
    description: "第 5 课：子函数内写 ret 接着，才跳到父函数内的 接着。父子都使用 q0，实际状态仍隔离。父写 1、子写 2、父写 3，空输入 4 步输出 123。",
    rules: `写二(q0, 接着):
    q0,□ -> 接着,2,R
    ret 接着

主函数(q0, 结束, 写=写二):
    q0,□ -> 中间,1,R
    中间,□ -> 写
    接着,□ -> 结束,3,N

主函数`,
  },
  functionExportEntry: {
    ...defaults, name: "函数：选择公开状态为入口", initialState: "流程.第二步",
    description: "第 6 课：导出状态 用于公开内部状态，ret 用于跳到外部。初始状态填 流程.第二步 得到 23（2 步）；改成 流程 得到 123（3 步）；流程.第三步 得到 3（1 步）。",
    rules: `流程(q0, HALT):
    q0,□ -> 第二步,1,R
    第二步,□ -> 第三步,2,R
    第三步,□ -> HALT,3,N
    导出状态 第二步, 第三步`,
  },
  functionExportRepeat: {
    ...defaults, name: "函数：公开规则与重复调用", initialState: "写一对",
    description: "第 7 课：函数内部公开 补写，外面用 写一对.补写 补充规则。重复调用时，这条规则会匹配各自的内部副本。空输入 4 步输出 1212；每增加一行 写一对 多输出 12、多运行 2 步。",
    rules: `写一对(q0, 结束):
    q0,□ -> 补写,1,R
    导出状态 补写

写一对.补写,□ -> 结束,2,R

写一对
写一对`,
  },
  functionExports: {
    ...defaults, name: "函数：子函数与返回状态", initialState: "主函数",
    description: "第 8 课（综合）：绑定 写=写一，子函数用 ret after 返回父状态；导出状态 inside 公开为 主函数.inside；主函数用 ret q1 跳到外部 q1。空输入 5 步输出 1234。",
    rules: `写一(s, after):
    s,□ -> after,1,R
    ret after

主函数(q0, q1, 写=写一):
    q0,□ -> 写
    after,□ -> inside,2,R
    导出状态 inside
    ret q1

主函数.inside,□ -> q1,3,R
q1,□ -> HALT,4,N

主函数`,
  },
  functionMixed: {
    ...defaults, name: "函数：条件调用与混合函数体", initialState: "copy", input: "111", blankSymbol: "0",
    description: "第 9 课：沿用 copy 条件包装结构，规则和裸调用可写在同一函数体。读到 1 跳到下面的 pred，读到 l 就左移退出；这里的 pred 删除末尾一个 1。输入 111 经 6 步得到 11；换成 l 时 1 步保留 l。",
    rules: `pred(q0, done):
    # 找到末尾，删除最后一个 1。
    q0,1->scan,1,R
    scan,1->scan,1,R
    scan,0->erase,0,L
    erase,1->done,0,L

copy(0,1):
    # copy 在本例中负责条件判断；读取 1 时跳到后面的 pred 调用位置。
    0,1->pred
    # 读取 l 时直接完成 copy，不执行 pred。
    0,l->1,l,L
    pred

copy`,
  },
  functionMixedContinue: {
    ...defaults, name: "函数：混合续行与局部别名", initialState: "组合",
    description: "第 10 课：首 与 末 是子函数别名，跳到后面的裸调用会跳过中间代码；写二 后面没有同名裸调用，就地执行后继续 收尾。空输入 6 步输出 123。函数初始状态为 s，未匹配的规则分支仍会报缺规则。",
    rules: `写一(s,end):
    s,□->end,1,R
写二(s,end):
    s,□->end,2,R
写三(s,end):
    s,□->end,3,N

组合(s,end,首=写一,末=写三):
    # 进入 s，跳到后面的 首，不执行 跳过 这一组规则。
    s,□->首
    跳过,□->end,9,N
    首
    # 首 完成后到达这里；后面没有裸调用 写二，所以在这里调用并续行。
    接着,□->写二
    收尾,□->末
    末

组合`,
  },
  functionStarDefaults: {
    ...defaults, name: "函数：星号默认值与原地跳转", input: "1", initialState: "start",
    description: "第 11 课：写入处 * 保留读取符号，移动处 * 不移动。start 的目标 ready 是普通状态，只切换状态；ready 的目标 写R 是函数名，原地调用。函数内 R,* 写入字符 R，外部 *,R 保留 R 并右移，再用 L,* 写入字符 L。输入 1，5 步输出 RL，读写头停在位置 1。",
    rules: `写R(q0,done):
    # 写入的是字符 R；移动处 * 表示原地不动。
    q0,1->done,R,*

# 两个 * 保持符号、不移动，目标 ready 是普通状态。
start,1->ready,*,*
# 目标 写R 是函数名，在当前位置调用。
ready,1->写R,*,*
# 函数正常完成后续行：保留 R，向右一格。
after,R->writeL,*,R
# 写入字符 L，原地停机。
writeL,□->HALT,L,*`,
  },
  functionTypedParameters: {
    ...defaults, name: "函数：符号、状态与函数参数", input: "1", initialState: "组合",
    description: "第 12 课：前两项仍是初始状态、退出状态，后面才写 参数,类型。移动=右移,函数 绑定子函数；完成=finish,状态 绑定真正的外部状态；1,符号 和 □,符号 直接填写符号。组合仍只写名字调用：原地调用右移、在右侧写 2、跳到外部 finish 改成 3；输入 1，4 步输出 13。未标类型的等号绑定先查函数，否则按外部状态处理。",
    rules: `右移(q0,done,1,符号):
    # 符号直接写在参数中，也直接用于规则，不需要 内部符号=1。
    q0,1->done,*,R

组合(q0,done,移动=右移,函数,完成=finish,状态,1,符号,□,符号):
    # 先识别 移动 是绑定函数：保持符号、不移动地调用。
    q0,1->移动,*,*
    # 函数正常完成后续行；完成 绑定到外部 finish，写 2 后直接跳出。
    after,□->完成,2,*

# 外部状态始终是 finish，不加函数内部前缀。
finish,2->HALT,3,*
组合`,
  },
  functionOmittedFields: {
    ...defaults, name: "函数：省略字段与 R/L 简写", input: "1", initialState: "省略",
    description: "第 13 课：目标后什么也不写，保持符号且不移动；写入或方向可分别留空。只剩一个字段时优先认 R/L 为移动，其它值为写入。要写入字母 R/L，用 R,* 或 L,*。输入 1，经 8 步得到 2L，读写头回到位置 0。函数内同样适用。",
    rules: `省略(q0,done):
    # 没有写入和方向：只切换到 blank，不改纸带、不移动。
    q0,1->blank
    # 两个位置都留空，与 *,* 等价。
    # 分别留空也支持：q0,1->q1,,R 保持符号右移，q0,1->q1,2, 写 2 不移动。
    blank,1->short,,
    # 只写 R：优先视作右移，保持读取的 1。
    short,1->writeR,R
    # 多写一个逗号和 *，这里才是写入字母 R。
    writeR,□->writeL,R,*
    writeL,R->back,L,*
    # 只写 L：左移，保持刚才写入的 L。
    back,L->write2,L
    # 单个字段不是 R/L：写入 2，默认不移动。
    write2,1->finish,2
    # 单星号占位：保持符号、不移动，到 done 正常完成。
    finish,2->done,*,*
省略`,
  },
  functionStarLiterals: {
    ...defaults, name: "函数：星号字符的转义", initialState: "星号",
    description: "第 14 课：单个 * 是通配或默认占位；字面星号必须多写一个：** 表示字符 *，*** 表示两个星号组成的符号，**** 表示三个。读取、写入、符号参数都一致。空输入运行 5 步，位置 0 含 *，位置 1 含 **；后者是一个格子中的多字符符号。",
    rules: `星号(q0,done,**,符号,***,符号):
    # 写入一个字面星号，不是保持空白。
    q0,□->one,**,*
    # 读取一个星号，写入两个星号组成的符号。
    one,**->two,***,*
    # 读取两个星号，写入三个星号组成的符号。
    two,***->three,****,*
    # 再写回单个星号，右移一格。
    three,****->right,**,R
    # 右边格子写入两个星号，原地完成。
    right,□->done,***,*
星号`,
  },
  functionWildcards: {
    ...defaults, name: "函数：任意符号与任意状态", input: "A", initialState: "通配",
    description: "第 15 课：读取留空或 * 匹配任意符号；当前状态留空或 * 匹配函数内任意局部状态。写入 * 保持实际读到的符号。明确规则优先，通配作为默认分支。输入 A 经 4 步得到 A*；改成 Z 时 2 步保留 Z。函数内任意状态不会影响外部或其它函数。",
    rules: `通配(q0,done):
    # 读取项留空：q0 遇到任何符号都保持原样，转到 check。
    # 也可以写 q0,*->check,*,*，但不要同时保留两条等价规则。
    q0,->check,*,*
    # 当前状态留空：任意局部状态读到 A 都转到 specific 并右移。
    # 等价写法是 *,A->specific,R。
    ,A->specific,R
    # 明确的状态与符号分支优先；** 写入字面星号。
    specific,□->finish,**,*
    # 两项都是 *：其它情况都原样完成；也可写 ,->done,*,*。
    *,*->done,*,*
通配`,
  },
};
