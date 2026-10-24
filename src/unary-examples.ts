import type { ExampleProject } from "./examples";

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
};
