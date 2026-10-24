import type { ExampleProject } from "./examples";

/** Bounded unary primality tests are remainder automata, not a prime lookup. */
function goldbachRules(): string {
  const rules: string[] = [];
  for (let count = 0; count <= 100; count += 1) {
    rules.push(`GB.input.${count},1 -> ${count < 100 ? `GB.input.${count + 1}` : "REJECT"},1,${count < 100 ? "R" : "N"}`);
    const valid = count >= 4 && count % 2 === 0;
    rules.push(`GB.input.${count},□ -> ${valid ? "GB.rewind" : "REJECT"},□,${valid ? "L" : "N"}`);
  }
  rules.push(`GB.rewind,1 -> GB.rewind,1,L
GB.rewind,□ -> GB.first,□,R
GB.first,1 -> GB.second,1,R
GB.second,1 -> GB.insert,1,R
GB.insert,1 -> GB.shift,+,R
GB.shift,1 -> GB.shift,1,R
GB.shift,□ -> GB.restart,1,L
GB.restart,1 -> GB.restart,1,L
GB.restart,+ -> GB.restart,+,L
GB.restart,□ -> GB.P.2.c0,□,R
GB.fail,1 -> GB.fail,1,L
GB.fail,+ -> GB.movePlus,1,R
GB.movePlus,1 -> GB.restart,+,L
GB.movePlus,□ -> REJECT,□,N`);

  // Every composite <=100 has a divisor in 2..10. Testing all these divisors
  // avoids storing prime answers and lets the machine scan each candidate.
  for (const side of ["P", "Q"]) for (let divisor = 2; divisor <= 10; divisor += 1) {
    const base = `GB.${side}.${divisor}`;
    const end = side === "P" ? "+" : "□";
    const finish = (state: string, composite: boolean) => {
      if (composite) rules.push(`${state},${end} -> GB.fail,${end},${side === "P" ? "N" : "L"}`);
      else if (divisor < 10) rules.push(`${state},${end} -> ${base}.rewind,${end},L`);
      else rules.push(`${state},${end} -> ${side === "P" ? "GB.Q.2.c0" : "ACCEPT"},${end},${side === "P" ? "R" : "N"}`);
    };
    for (let count = 0; count <= divisor; count += 1) {
      const state = `${base}.c${count}`;
      rules.push(`${state},1 -> ${base}.${count < divisor ? `c${count + 1}` : "r1"},1,R`);
      finish(state, count < 2);
    }
    for (let remainder = 0; remainder < divisor; remainder += 1) {
      const state = `${base}.r${remainder}`;
      rules.push(`${state},1 -> ${base}.r${(remainder + 1) % divisor},1,R`);
      finish(state, remainder === 0);
    }
    if (divisor < 10) {
      rules.push(`${base}.rewind,1 -> ${base}.rewind,1,L`);
      rules.push(`${base}.rewind,${side === "P" ? "□" : "+"} -> GB.${side}.${divisor + 1}.c0,${side === "P" ? "□" : "+"},R`);
    }
  }
  return rules.join("\n");
}

function collatzRules(): string {
  const rules = [`C.check,1 -> C.single,1,R
C.check,0 -> REJECT,0,N
C.check,□ -> REJECT,□,N
C.single,□ -> ACCEPT,□,N
C.single,0 -> C.end,0,N
C.single,1 -> C.end,1,N
C.end,0 -> C.end,0,R
C.end,1 -> C.end,1,R
C.end,□ -> C.parity,□,L
C.parity,0 -> C.rewind,□,L
C.parity,1 -> C.add.0.1,1,N
C.rewind,0 -> C.rewind,0,L
C.rewind,1 -> C.rewind,1,L
C.rewind,□ -> C.check,□,R
C.prefix,□ -> C.rewind,1,L`];
  for (const previous of [0, 1]) for (const carry of [0, 1]) {
    const state = `C.add.${previous}.${carry}`;
    for (const bit of [0, 1]) {
      const sum = bit + previous + carry; // n + 2n + 1, right to left
      rules.push(`${state},${bit} -> C.add.${bit}.${Math.floor(sum / 2)},${sum % 2},L`);
    }
    const leading = previous + carry;
    rules.push(`${state},□ -> ${leading === 2 ? "C.prefix" : "C.rewind"},${leading === 0 ? "□" : leading % 2},${leading === 0 ? "N" : "L"}`);
  }
  return rules.join("\n");
}

export const conjectureExamples: Record<string, ExampleProject> = {
  goldbach: {
    name: "哥德巴赫验证（单个偶数 ≤100）", category: "猜想验证",
    description: "输入 n 个 1 表示一个 4–100 的偶数，如 1111111111 表示 10。机器实际试除并搜索素数分拆，接受后输出 1^p+1^q（如 111+1111111）。无效输入拒绝。仅验证给定输入，不证明整个猜想。",
    input: "1111111111", initialState: "GB.input.0", blankSymbol: "□", acceptStates: "ACCEPT", rejectStates: "REJECT", haltStates: "", rules: goldbachRules(),
  },
  collatz: {
    name: "考拉兹验证（3n+1，二进制）", category: "猜想验证",
    description: "输入无前导 0 的正整数二进制，左边是高位，例如 110 表示 6。偶数除 2，奇数乘 3 加 1；到达 1 时 ACCEPT。0 和空输入拒绝。仅验证此起点，达到步数上限只表示暂停，不能当作反例或全体证明。",
    input: "110", initialState: "C.check", blankSymbol: "□", acceptStates: "ACCEPT", rejectStates: "REJECT", haltStates: "", rules: collatzRules(),
  },
};
