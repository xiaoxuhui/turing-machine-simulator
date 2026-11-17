import { unaryExamples } from "./unary-examples";
import { hyperoperationExamples } from "./hyperoperation-examples";

export const advancedSolutions = {
  "function-wrap": "追加(q0,done):\n    q0,1 -> q0,1,R\n    q0,□ -> done,1,R\n\n追加",
  "function-sequence": "追加(q0,done):\n    q0,1 -> q0,1,R\n    q0,□ -> done,1,R\n\n追加\n追加",
  "function-conditional": "flip(q0,done):\n    q0,0->done,1,R\n    q0,1->done,0,R\n\nstart,0->ready,*,*\nstart,1->ready,*,*\nready,0->flip,*,*\nready,1->flip,*,*\ndone,□->HALT,1,*",
  "function-ret": "选择(q0,done):\n    q0,0 -> outside,0,R\n    q0,1 -> done,1,R\n    ret outside\n\nstart,0 -> 选择,0,N\nstart,1 -> 选择,1,N\ndone,□ -> HALT,1,N\noutside,□ -> HALT,0,N",
  "unary-addition": unaryExamples.unaryAdd.rules,
  "multiply-as-addition": unaryExamples.unaryMultiply.rules,
  "unary-subtraction": unaryExamples.unarySubtract.rules,
  "unary-product": unaryExamples.unaryMultiply.rules,
  "unary-square": hyperoperationExamples.unaryPower.rules,
  "unary-power": hyperoperationExamples.unaryPower.rules,
  "unary-tetration": hyperoperationExamples.unaryTetration.rules,
  "unary-pentation": hyperoperationExamples.unaryPentation.rules,
};

export const solutionRules: Record<string, string> = {
  ...advancedSolutions,
  "write-one": "q0,□ -> HALT,1,N",
  "move-right-write": "q0,1 -> write,1,R\nwrite,□ -> HALT,1,N",
  "unary-increment": "q0,1 -> q0,1,R\nq0,□ -> HALT,1,N",
  "erase-one": "q0,1 -> HALT,□,N",
  "erase-unary": "q0,1 -> q0,□,R\nq0,□ -> HALT,□,N",
  "unary-decrement": "scan,1 -> scan,1,R\nscan,□ -> erase,□,L\nerase,1 -> HALT,□,N",
  "zeros-to-ones": "q0,0 -> q0,1,R\nq0,1 -> q0,1,R\nq0,□ -> HALT,□,N",
  "binary-complement": "q0,0 -> q0,1,R\nq0,1 -> q0,0,R\nq0,□ -> HALT,□,N",
  "turn-back": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> last,□,L\nlast,0 -> HALT,1,N\nlast,1 -> HALT,1,N",
  "binary-increment": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> carry,□,L\ncarry,0 -> HALT,1,N\ncarry,1 -> carry,0,L\ncarry,□ -> HALT,1,N",
  "copy-first-bit": "start,0 -> remember0,0,R\nstart,1 -> remember1,1,R\nremember0,0 -> remember0,0,R\nremember0,1 -> remember0,1,R\nremember0,□ -> HALT,0,N\nremember1,0 -> remember1,0,R\nremember1,1 -> remember1,1,R\nremember1,□ -> HALT,1,N",
  "alternating-unary": "write1,1 -> write0,1,R\nwrite0,1 -> write1,0,R\nwrite1,□ -> HALT,□,N\nwrite0,□ -> HALT,□,N",
  "binary-decrement": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> borrow,□,L\nborrow,0 -> borrow,1,L\nborrow,1 -> HALT,0,N",
  "unary-parity": "even,1 -> odd,□,R\nodd,1 -> even,□,R\neven,□ -> HALT,0,N\nodd,□ -> HALT,1,N",
  "twos-complement": "scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> seek,□,L\nseek,0 -> seek,0,L\nseek,1 -> flip,1,L\nseek,□ -> HALT,□,N\nflip,0 -> flip,1,L\nflip,1 -> flip,0,L\nflip,□ -> HALT,□,N",
  "unary-double": "seek,X -> seek,X,R\nseek,1 -> toEnd,X,R\nseek,Y -> restoreLeft,Y,L\ntoEnd,X -> toEnd,X,R\ntoEnd,1 -> toEnd,1,R\ntoEnd,Y -> toEnd,Y,R\ntoEnd,□ -> return,Y,L\nreturn,X -> return,X,L\nreturn,1 -> return,1,L\nreturn,Y -> return,Y,L\nreturn,□ -> seek,□,R\nrestoreLeft,X -> restoreLeft,1,L\nrestoreLeft,1 -> restoreLeft,1,L\nrestoreLeft,□ -> restoreRight,□,R\nrestoreRight,1 -> restoreRight,1,R\nrestoreRight,Y -> restoreRight,1,R\nrestoreRight,□ -> HALT,□,N",
};
