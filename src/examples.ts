export interface ExampleProject {
  name: string;
  description: string;
  input: string;
  initialState: string;
  blankSymbol: string;
  acceptStates: string;
  rejectStates: string;
  haltStates: string;
  rules: string;
}

export const examples: Record<string, ExampleProject> = {
  unary: {
    name: "一进制加一",
    description: "越过所有 1，在末尾写入一个 1。",
    input: "111",
    initialState: "q0",
    blankSymbol: "□",
    acceptStates: "",
    rejectStates: "",
    haltStates: "HALT",
    rules: `q0,1 -> q0,1,R\nq0,□ -> HALT,1,N`,
  },
  binary: {
    name: "二进制加一",
    description: "先移动到最右端，再从低位处理进位。",
    input: "1011",
    initialState: "scan",
    blankSymbol: "□",
    acceptStates: "",
    rejectStates: "",
    haltStates: "HALT",
    rules: `scan,0 -> scan,0,R\nscan,1 -> scan,1,R\nscan,□ -> carry,□,L\ncarry,0 -> HALT,1,N\ncarry,1 -> carry,0,L\ncarry,□ -> HALT,1,N`,
  },
  palindrome: {
    name: "二进制回文判断",
    description: "逐次标记两端字符；进入 ACCEPT 或 REJECT。",
    input: "1001",
    initialState: "start",
    blankSymbol: "□",
    acceptStates: "ACCEPT",
    rejectStates: "REJECT",
    haltStates: "",
    rules: `start,X -> start,X,R\nstart,Y -> start,Y,R\nstart,0 -> seek0,X,R\nstart,1 -> seek1,Y,R\nstart,□ -> ACCEPT,□,N\nseek0,0 -> seek0,0,R\nseek0,1 -> seek0,1,R\nseek0,X -> seek0,X,R\nseek0,Y -> seek0,Y,R\nseek0,□ -> check0,□,L\ncheck0,0 -> back,X,L\ncheck0,X -> check0,X,L\ncheck0,Y -> check0,Y,L\ncheck0,1 -> REJECT,1,N\ncheck0,□ -> ACCEPT,□,N\nseek1,0 -> seek1,0,R\nseek1,1 -> seek1,1,R\nseek1,X -> seek1,X,R\nseek1,Y -> seek1,Y,R\nseek1,□ -> check1,□,L\ncheck1,1 -> back,Y,L\ncheck1,X -> check1,X,L\ncheck1,Y -> check1,Y,L\ncheck1,0 -> REJECT,0,N\ncheck1,□ -> ACCEPT,□,N\nback,0 -> back,0,L\nback,1 -> back,1,L\nback,X -> back,X,L\nback,Y -> back,Y,L\nback,□ -> start,□,R`,
  },
  beaver: {
    name: "2 状态忙碌海狸",
    description: "从空纸带出发，执行 6 步后留下 4 个 1。",
    input: "",
    initialState: "A",
    blankSymbol: "0",
    acceptStates: "",
    rejectStates: "",
    haltStates: "HALT",
    rules: `A,0 -> B,1,R\nA,1 -> B,1,L\nB,0 -> A,1,L\nB,1 -> HALT,1,R`,
  },
};
