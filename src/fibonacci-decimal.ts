import type { Direction } from "./core";
import type { ExampleProject } from "./examples";

const digits = [..."0123456789"], pending = "|#(pending)";
const markA = (char: string) => `${char}#(F.A)`;
const markB = (char: string) => `${char}#(F.B)`;
const markL = (char: string) => `${char}#(F.L)`;
const markR = (char: string) => `${char}#(F.R)`;
const sources = [...digits, "|"].flatMap(char => [char, markA(char), markB(char)]);

/** Decimal column addition followed by in-place reversal of the newly written sum. */
export function makeDecimalFibonacci(): ExampleProject {
  const lines = [
    "# Fibonacci decimal infinite",
    "# 十进制逐位相加，| 分隔各项；空白为 □，不设数值或项数上限。",
    "# F.A/F.B 标记前两项的当前位；F.L/F.R 交换新结果的两端。",
  ];
  const seen = new Set<string>();
  const rule = (state: string, read: string, next: string, write = read, direction: Direction = "N") => {
    const key = `${state},${read}`;
    if (seen.has(key)) throw new Error(`斐波那契规则重复：${key}`);
    seen.add(key); lines.push(`${state},${read}->${next},${write},${direction}`);
  };
  const sweep = (state: string, alphabet: string[], direction: Direction) => {
    for (const char of alphabet) rule(state, char, state, char, direction);
  };
  ["|", "0", "|", "1"].forEach((char, i) => rule(i === 0 ? "F.seed" : `F.seed.${i}`, "□", i === 3 ? "F.next" : `F.seed.${i + 1}`, char, "R"));
  rule("F.next", "□", "F.markB", "□", "L");
  for (const digit of digits) rule("F.markB", digit, "F.sepB", markB(digit), "L");
  sweep("F.sepB", digits, "L"); rule("F.sepB", "|", "F.markA", "|", "L");
  for (const digit of digits) rule("F.markA", digit, "F.append", markA(digit), "R");
  sweep("F.append", sources, "R"); rule("F.append", "□", "F.readA.0", pending, "L");

  // Each state remembers at most one decimal digit and one carry bit.
  for (const carry of [0, 1]) {
    const readA = `F.readA.${carry}`;
    sweep(readA, [...digits, "|", ...[...digits, "|"].map(markB), pending], "L");
    for (const a of [...digits, "|"]) {
      const readB = `F.readB.${carry}.${a === "|" ? "end" : a}`;
      rule(readA, markA(a), readB, markA(a), "R");
      sweep(readB, [...digits, "|", pending], "R");
      for (const b of [...digits, "|"]) {
        const sum = Number(a === "|" ? 0 : a) + Number(b === "|" ? 0 : b) + carry;
        const end = a === "|" && b === "|";
        const next = end && !carry ? "F.clean" : `F.write.${sum % 10}.${end ? "end" : Math.floor(sum / 10)}`;
        rule(readB, markB(b), next, markB(b), end && !carry ? "N" : "R");
      }
    }
  }
  for (const tail of ["0", "1", "end"]) for (const digit of digits) {
    const state = `F.write.${digit}.${tail}`;
    sweep(state, [...sources, pending], "R");
    rule(state, "□", tail === "end" ? "F.clean" : `F.moveA.${tail}`, digit, "L");
  }
  for (const carry of [0, 1]) {
    const moveA = `F.moveA.${carry}`, advanceA = `F.advanceA.${carry}`;
    sweep(moveA, [...digits, "|", ...[...digits, "|"].map(markB), pending], "L");
    for (const digit of digits) rule(moveA, markA(digit), advanceA, digit, "L");
    rule(moveA, markA("|"), `F.moveB.${carry}`, markA("|"), "R");
    for (const char of [...digits, "|"]) rule(advanceA, char, `F.moveB.${carry}`, markA(char), "R");
    sweep(`F.moveB.${carry}`, [...digits, "|"], "R");
    for (const digit of digits) rule(`F.moveB.${carry}`, markB(digit), `F.advanceB.${carry}`, digit, "L");
    rule(`F.moveB.${carry}`, markB("|"), `F.readA.${carry}`, markB("|"), "L");
    for (const char of [...digits, "|"]) rule(`F.advanceB.${carry}`, char, `F.readA.${carry}`, markB(char), "L");
  }

  // Restore the two source terms; only the pending result will be reversed.
  sweep("F.clean", [...digits, "|", pending], "L");
  for (const char of [...digits, "|"]) {
    rule("F.clean", markA(char), "F.clean", char, "L");
    rule("F.clean", markB(char), "F.clean", char, "L");
  }
  rule("F.clean", "□", "F.findPending", "□", "R"); sweep("F.findPending", [...digits, "|"], "R");
  rule("F.findPending", pending, "F.reverseFirst", pending, "R");
  for (const digit of digits) rule("F.reverseFirst", digit, "F.reverseEnd", markL(digit), "R");
  sweep("F.reverseEnd", digits, "R"); rule("F.reverseEnd", "□", "F.reverseLast", "□", "L");
  for (const digit of digits) {
    rule("F.reverseLast", markL(digit), "F.commit", digit, "L");
    rule("F.reverseLast", digit, "F.findL", markR(digit), "L");
    rule("F.findL", markL(digit), `F.toR.${digit}`, markL(digit), "R");
    sweep(`F.toR.${digit}`, digits, "R");
    sweep(`F.toL.${digit}`, digits, "L");
    for (const other of digits) {
      rule(`F.toR.${digit}`, markR(other), `F.toL.${other}`, markR(digit), "L");
      rule(`F.toL.${digit}`, markL(other), "F.advanceL", digit, "R");
    }
    rule("F.advanceL", markR(digit), "F.commit", digit, "L");
    rule("F.advanceL", digit, "F.findR", markL(digit), "R");
    rule("F.findR", markR(digit), "F.advanceR", digit, "L");
    rule("F.advanceR", markL(digit), "F.commit", digit, "L");
    rule("F.advanceR", digit, "F.findL", markR(digit), "L");
  }
  sweep("F.findL", digits, "L"); sweep("F.findR", digits, "R");
  sweep("F.commit", digits, "L"); rule("F.commit", pending, "F.ready", "|", "R");
  sweep("F.ready", digits, "R"); rule("F.ready", "□", "F.next");
  return {
    category: "数列生成", name: "斐波那契数列（十进制 · 无限运行）",
    description: "从 0、1 开始，逐位相加前两项；带进位生成十进制新项，用 | 分隔，一位一格，可随时暂停。",
    input: "", blankSymbol: "□", initialState: "F.seed", haltStates: "", acceptStates: "", rejectStates: "",
    maxSteps: null, rules: lines.join("\n"),
  };
}
