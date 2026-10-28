import { unaryExamples } from "../src/unary-examples";
import { hyperoperationExamples } from "../src/hyperoperation-examples";

export const advancedSolutions: Record<string, string> = {
  "function-wrap": "追加(q0,done):\n    q0,1 -> q0,1,R\n    q0,□ -> done,1,R\n\n追加",
  "function-sequence": "追加(q0,done):\n    q0,1 -> q0,1,R\n    q0,□ -> done,1,R\n\n追加\n追加",
  "function-conditional": "flip(q0,done):\n    q0,0 -> done,1,R\n    q0,1 -> done,0,R\n\nstart,0 -> flip,0,N\nstart,1 -> flip,1,N\nafter,□ -> HALT,1,N",
  "function-ret": "选择(q0,done):\n    q0,0 -> outside,0,R\n    q0,1 -> done,1,R\n    ret outside\n\nstart,0 -> 选择,0,N\nstart,1 -> 选择,1,N\nnext,□ -> HALT,1,N\noutside,□ -> HALT,0,N",
  "unary-addition": unaryExamples.unaryAdd.rules,
  "multiply-as-addition": unaryExamples.unaryMultiply.rules,
  "unary-subtraction": unaryExamples.unarySubtract.rules,
  "unary-product": unaryExamples.unaryMultiply.rules,
  "unary-square": hyperoperationExamples.unaryPower.rules,
  "unary-power": hyperoperationExamples.unaryPower.rules,
  "unary-tetration": hyperoperationExamples.unaryTetration.rules,
  "unary-pentation": hyperoperationExamples.unaryPentation.rules,
};
