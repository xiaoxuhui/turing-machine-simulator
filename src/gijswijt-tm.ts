import type { Direction, Tape } from "./core";
import type { ProjectData } from "./project-codec";
import { readDecimalSequenceOutput } from "./decimal-sequence-output";
export { readDecimalSequenceOutput as readGijswijtDecimalOutput } from "./decimal-sequence-output";

const O = 1, S = 2, A = 4, B = 8;
const digits = [..."0123456789"], characters = [...digits, "|"];
const C = "1#(count)", M = "1#(best)", BOTH = "1#(both)", USED = "0#(used)";
const counters = [C, M, BOTH, USED], pending = "|#(pending)";
const symbol = (char: string, flags = 0): string => flags
  ? `${char}#(${[O, S, A, B].map((bit, i) => flags & bit ? "OSAB"[i] : "").join("")})` : char;
const cells = characters.flatMap(char => Array.from({ length: 16 }, (_, flags) => ({ char, flags, text: symbol(char, flags) })));

/** A finite ordinary rule table; both counters and decimal terms grow on the tape. */
export function compileGijswijtMachine(threshold: number | null): ProjectData {
  if (threshold !== null && (!Number.isSafeInteger(threshold) || threshold < 0)) throw new Error("请输入大于或等于 0 的安全整数阈值，或选择无限生成。");
  const lines = [
    `# Gijswijt threshold=${threshold ?? "inf"} decimal=1`,
    "# 十进制一位一格，| 分隔数列项，□ 为空白；隐藏标记记录比较位置。",
    "# @ 左侧的一进制工作计数器可增长；全部计算均由下面的转移规则执行。",
  ];
  const seen = new Set<string>();
  const rule = (state: string, read: string, next: string, write = read, direction: Direction = "N") => {
    const key = `${state},${read}`;
    if (seen.has(key)) throw new Error(`编译器产生重复规则：${key}`);
    seen.add(key); lines.push(`${state},${read}->${next},${write},${direction}`);
  };
  const sweep = (state: string, direction: Direction, alphabet = cells.map(c => c.text), next = state) => {
    for (const char of alphabet) rule(state, char, next, char, direction);
  };
  const workSweep = (state: string, direction: Direction) => sweep(state, direction, counters);

  rule("G.seed", "□", "G.seedDigit", "|", "R");
  rule("G.seedDigit", "□", "G.seedBack", "1", "L");
  rule("G.seedBack", "|", "G.seedFence", "|", "L");
  rule("G.seedFence", "□", "G.seedCounter", "@", "L");
  rule("G.seedCounter", "□", "G.seedReady", BOTH, "R");
  rule("G.seedReady", "@", "G.checkSeekEnd", "@", "R");

  // A block always starts at a term separator, never halfway through a number.
  rule("G.next", "□", "G.origin", "□", "L"); sweep("G.origin", "L", digits);
  rule("G.origin", "|", "G.trial", symbol("|", O));
  for (const c of cells) {
    if (c.flags & O) rule("G.trial", c.text, "G.markB", symbol(c.char, c.flags | S), "L");
    rule("G.markB", c.text, "G.endA", symbol(c.char, c.flags | B), "R");
    rule("G.markA", c.text, "G.compare", symbol(c.char, c.flags | A));
    if (c.flags & A) rule("G.compare", c.text, `G.findB.${c.char === "|" ? "sep" : c.char}.${c.flags & S ? 1 : 0}`, c.text, "L");
  }
  rule("G.markB", "@", "G.cleanL");
  sweep("G.endA", "R"); rule("G.endA", "□", "G.markA", "□", "L");
  for (const char of characters) for (const boundary of [0, 1]) {
    const state = `G.findB.${char === "|" ? "sep" : char}.${boundary}`;
    for (const c of cells) {
      if (!(c.flags & B)) rule(state, c.text, state, c.text, "L");
      else if (c.char !== char) rule(state, c.text, "G.cleanL");
      else rule(state, c.text, boundary ? "G.incSeekFence" : "G.moveB.0", symbol(c.char, (c.flags & ~B) | (boundary ? S : 0)), "L");
    }
  }
  // Completed-block count lives on the tape, with no bound encoded in the states.
  sweep("G.incSeekFence", "L"); rule("G.incSeekFence", "@", "G.inc", "@", "L");
  sweep("G.inc", "L", [C, BOTH]);
  rule("G.inc", M, "G.incReturn", BOTH, "R"); rule("G.inc", "□", "G.incReturn", C, "R");
  workSweep("G.incReturn", "R"); rule("G.incReturn", "@", "G.incFindS", "@", "R");
  for (const c of cells) rule("G.incFindS", c.text, c.flags & S ? "G.moveB.1" : "G.incFindS", c.text, c.flags & S ? "L" : "R");
  for (const boundary of [0, 1]) {
    for (const c of cells) {
      rule(`G.moveB.${boundary}`, c.text, `G.returnA.${boundary}`, symbol(c.char, c.flags | B), "R");
      rule(`G.returnA.${boundary}`, c.text, c.flags & A ? "G.moveA" : `G.returnA.${boundary}`,
        c.flags & A ? symbol(c.char, c.flags & ~A & (boundary ? ~S : -1)) : c.text, c.flags & A ? "L" : "R");
    }
    rule(`G.moveB.${boundary}`, "@", "G.cleanL");
  }
  for (const c of cells) rule("G.moveA", c.text, "G.compare", symbol(c.char, c.flags | A));

  // best := max(best,count), count := 1; then try the previous whole-term suffix.
  sweep("G.cleanL", "L"); rule("G.cleanL", "@", "G.merge", "@", "L");
  for (const char of [C, M, BOTH]) rule("G.merge", char, "G.merge", M, "L");
  rule("G.merge", "□", "G.mergeReturn", "□", "R"); workSweep("G.mergeReturn", "R");
  rule("G.mergeReturn", "@", "G.resetCount", "@", "L");
  rule("G.resetCount", M, "G.cleanStart", BOTH, "R"); rule("G.cleanStart", "@", "G.cleanR", "@", "R");
  for (const c of cells) rule("G.cleanR", c.text, "G.cleanR", symbol(c.char, c.flags & O), "R");
  rule("G.cleanR", "□", "G.findO", "□", "L");
  for (const c of cells) rule("G.findO", c.text, c.flags & O ? "G.shiftO" : "G.findO", c.flags & O ? c.char : c.text, "L");
  sweep("G.shiftO", "L", digits); rule("G.shiftO", "|", "G.trial", symbol("|", O));
  rule("G.shiftO", "@", "G.appendEnd", "@", "R");

  // Consume best one unit at a time, incrementing an ordinary decimal word.
  sweep("G.appendEnd", "R", characters); rule("G.appendEnd", "□", "G.appendZero", pending, "R");
  rule("G.appendZero", "□", "G.takeSeekFence", "0", "L");
  sweep("G.takeSeekFence", "L", [...characters, pending]); rule("G.takeSeekFence", "@", "G.take", "@", "L");
  rule("G.take", USED, "G.take", USED, "L");
  for (const char of [M, BOTH]) rule("G.take", char, "G.addSeekFence", USED, "R");
  workSweep("G.addSeekFence", "R"); rule("G.addSeekFence", "@", "G.addSeekEnd", "@", "R");
  sweep("G.addSeekEnd", "R", [...characters, pending]); rule("G.addSeekEnd", "□", "G.addDigit", "□", "L");
  for (let digit = 0; digit < 9; digit++) rule("G.addDigit", String(digit), "G.takeSeekFence", String(digit + 1), "L");
  rule("G.addDigit", "9", "G.addDigit", "0", "L");
  rule("G.addDigit", pending, "G.growOne", pending, "R");
  rule("G.growOne", "0", "G.growEnd", "1", "R"); sweep("G.growEnd", "R", digits);
  rule("G.growEnd", "□", "G.takeSeekFence", "0", "L");
  rule("G.take", "□", "G.eraseUsed", "□", "R"); rule("G.eraseUsed", USED, "G.eraseUsed", "□", "R");
  rule("G.eraseUsed", "@", "G.initCounter", "@", "L"); rule("G.initCounter", "□", "G.commitStart", BOTH, "R");
  rule("G.commitStart", "@", "G.commit", "@", "R"); sweep("G.commit", "R", characters);
  rule("G.commit", pending, "G.checkSeekEnd", "|", "R");

  // Optional threshold comparison: decimal length, then lexicographic order.
  sweep("G.checkSeekEnd", "R", characters);
  if (threshold === null) rule("G.checkSeekEnd", "□", "G.next");
  else {
    const limit = String(threshold);
    rule("G.checkSeekEnd", "□", "G.checkStart", "□", "L"); sweep("G.checkStart", "L", digits);
    rule("G.checkStart", "|", "G.length.0", "|", "R");
    for (let i = 0; i <= limit.length; i++) {
      sweep(`G.length.${i}`, i === limit.length ? "N" : "R", digits, i === limit.length ? "G.stopSeekFence" : `G.length.${i + 1}`);
      rule(`G.length.${i}`, "□", i === limit.length ? "G.lexStart" : "G.next", "□", i === limit.length ? "L" : "N");
    }
    sweep("G.lexStart", "L", digits); rule("G.lexStart", "|", "G.lex.0", "|", "R");
    for (let i = 0; i < limit.length; i++) for (const digit of digits) {
      rule(`G.lex.${i}`, digit, digit > limit[i] ? "G.stopSeekFence" : digit < limit[i] ? "G.continueEnd" : `G.lex.${i + 1}`, digit, digit === limit[i] ? "R" : "N");
    }
    rule(`G.lex.${limit.length}`, "□", "G.next");
    sweep("G.continueEnd", "R", digits); rule("G.continueEnd", "□", "G.next");
    sweep("G.stopSeekFence", "L", characters); rule("G.stopSeekFence", "@", "G.eraseCounters", "@", "L");
    for (const char of counters) rule("G.eraseCounters", char, "G.eraseCounters", "□", "L");
    rule("G.eraseCounters", "□", "G.stopReturn", "□", "R"); rule("G.stopReturn", "□", "G.stopReturn", "□", "R");
    rule("G.stopReturn", "@", "G.stopEnd", "□", "R"); sweep("G.stopEnd", "R", characters);
    rule("G.stopEnd", "□", "G.HALT", "□", "L");
  }
  return {
    format: "turing-machine-simulator", version: 1,
    name: `吉斯维杰特数列（${threshold === null ? "无限生成" : `超过 ${threshold} 停机`}）`,
    description: "逐格比较重复后缀；十进制一位一格，| 分隔各项；工作计数器可无限增长。",
    input: "", blankSymbol: "□", initialState: "G.seed", acceptStates: "", rejectStates: "",
    haltStates: threshold === null ? "" : "G.HALT", maxSteps: null, speed: 1000, rules: lines.join("\n"),
  };
}

/** Numeric convenience for bounded prefixes and existing consumers. */
export function readGijswijtOutput(tape: Tape): number[] {
  return readDecimalSequenceOutput(tape).map(Number);
}
