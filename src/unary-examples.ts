import type { ExampleProject } from "./examples";

const comparisonCleanup = ["<", "=", ">"].flatMap((result, index) => {
  const state = `cmp.result${index}`;
  return [
    ...["1", "X", "Y", "?"].map((read) => `${state},${read} -> ${state},${read},R`),
    `${state},□ -> ${state}.erase,□,L`,
    ...["1", "X", "Y", "?"].map((read) => `${state}.erase,${read} -> ${state}.erase,□,L`),
    `${state}.erase,□ -> ${state}.write,□,R`,
    `${state}.write,□ -> HALT,${result},N`,
  ];
}).join("\n");

export const unaryExamples: Record<string, ExampleProject> = {
  unaryAdd: {
    name: "一进制加法", category: "一进制运算",
    description: "格式 1^a+1^b：111+11 表示 3+2，结果 11111。空操作数表示 0，例如 +11；空纸带结果表示 0。",
    input: "111+11", initialState: "add.scan", blankSymbol: "□", acceptStates: "", rejectStates: "", haltStates: "HALT",
    rules: `add.scan,1 -> add.scan,1,R
add.scan,+ -> add.end,1,R
add.end,1 -> add.end,1,R
add.end,□ -> add.trim,□,L
add.trim,1 -> HALT,□,N`,
  },
  unarySubtract: {
    name: "一进制减法", category: "一进制运算",
    description: "格式 1^a-1^b：11111-11 表示 5−2，结果 111。空操作数表示 0；相减为 0 时纸带为空；a<b 时进入 REJECT（负结果）。",
    input: "11111-11", initialState: "sub.seek", blankSymbol: "□", acceptStates: "", rejectStates: "REJECT", haltStates: "HALT",
    rules: `sub.seek,1 -> sub.seek,1,R
sub.seek,- -> sub.pick,-,R
sub.pick,Y -> sub.pick,Y,R
sub.pick,1 -> sub.back,Y,L
sub.pick,□ -> sub.erase,□,L
sub.back,Y -> sub.back,Y,L
sub.back,- -> sub.take,-,L
sub.take,X -> sub.take,X,L
sub.take,1 -> sub.return,X,R
sub.take,□ -> REJECT,□,N
sub.return,X -> sub.return,X,R
sub.return,- -> sub.pick,-,R
sub.erase,Y -> sub.erase,□,L
sub.erase,- -> sub.clean,□,L
sub.clean,X -> sub.clean,□,L
sub.clean,1 -> sub.clean,1,L
sub.clean,□ -> HALT,□,N`,
  },
  unaryMultiply: {
    name: "一进制乘法", category: "一进制运算",
    description: "格式 1^a*1^b：111*11 表示 3×2。逐次复制得到 111111，结果留在原输入右侧，操作数和标记清除；任一空操作数表示乘以 0。",
    input: "111*11", initialState: "mul.init", blankSymbol: "□", acceptStates: "", rejectStates: "", haltStates: "HALT",
    rules: `mul.init,1 -> mul.init,1,R
mul.init,* -> mul.init,*,R
mul.init,□ -> mul.rewind,=,L
mul.rewind,1 -> mul.rewind,1,L
mul.rewind,* -> mul.rewind,*,L
mul.rewind,□ -> mul.pickA,□,R
mul.pickA,X -> mul.pickA,X,R
mul.pickA,1 -> mul.seek,X,R
mul.pickA,* -> mul.cleanLeft,*,L
mul.seek,1 -> mul.seek,1,R
mul.seek,X -> mul.seek,X,R
mul.seek,* -> mul.pickB,*,R
mul.pickB,Y -> mul.pickB,Y,R
mul.pickB,1 -> mul.end,Y,R
mul.pickB,= -> mul.restore,=,L
mul.end,1 -> mul.end,1,R
mul.end,Y -> mul.end,Y,R
mul.end,= -> mul.end,=,R
mul.end,□ -> mul.back,1,L
mul.back,1 -> mul.back,1,L
mul.back,Y -> mul.back,Y,L
mul.back,= -> mul.back,=,L
mul.back,* -> mul.pickB,*,R
mul.restore,Y -> mul.restore,1,L
mul.restore,* -> mul.backA,*,L
mul.backA,1 -> mul.backA,1,L
mul.backA,X -> mul.backA,X,L
mul.backA,□ -> mul.pickA,□,R
mul.cleanLeft,X -> mul.cleanLeft,X,L
mul.cleanLeft,□ -> mul.clean,□,R
mul.clean,X -> mul.clean,□,R
mul.clean,1 -> mul.clean,□,R
mul.clean,* -> mul.clean,□,R
mul.clean,= -> HALT,□,R`,
  },
  unaryCompare: {
    name: "一进制大小比较", category: "一进制运算",
    description: "格式 1^a?1^b：111?11 比较 3 和 2，结果为 >。逐对匹配，最后只留下 <、= 或 >；空操作数表示 0。",
    input: "111?11", initialState: "cmp.pick", blankSymbol: "□", acceptStates: "", rejectStates: "", haltStates: "HALT",
    rules: `cmp.pick,X -> cmp.pick,X,R
cmp.pick,1 -> cmp.seek,X,R
cmp.pick,? -> cmp.rest,?,R
cmp.seek,1 -> cmp.seek,1,R
cmp.seek,X -> cmp.seek,X,R
cmp.seek,? -> cmp.right,?,R
cmp.right,Y -> cmp.right,Y,R
cmp.right,1 -> cmp.back,Y,L
cmp.right,□ -> cmp.result2,□,N
cmp.back,1 -> cmp.back,1,L
cmp.back,X -> cmp.back,X,L
cmp.back,Y -> cmp.back,Y,L
cmp.back,? -> cmp.back,?,L
cmp.back,□ -> cmp.pick,□,R
cmp.rest,Y -> cmp.rest,Y,R
cmp.rest,1 -> cmp.result0,1,N
cmp.rest,□ -> cmp.result1,□,N
${comparisonCleanup}`,
  },
  unaryEven: {
    name: "一进制整除判断（÷2）", category: "一进制运算",
    description: "输入 n 个 1 表示 n，例如 1111 表示 4。每读一个 1 切换奇偶状态：能被 2 整除则 ACCEPT，否则 REJECT；空串表示 0，可被 2 整除。原输入保留。",
    input: "1111", initialState: "even", blankSymbol: "□", acceptStates: "ACCEPT", rejectStates: "REJECT", haltStates: "",
    rules: `even,1 -> odd,1,R
odd,1 -> even,1,R
even,□ -> ACCEPT,□,N
odd,□ -> REJECT,□,N`,
  },
};
