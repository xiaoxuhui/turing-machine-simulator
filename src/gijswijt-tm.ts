import type { Direction, Tape } from "./core";
import type { ProjectData } from "./project-codec";

// Four tracks encoded in one finite tape alphabet. O is the trial's original
// boundary, S the current block start, A/B the two comparison cursors.
const O = 1, S = 2, A = 4, B = 8;
interface Cell { digit: number; flags: number; text: string }
const symbol = (digit: number, flags = 0): string => flags === 0
  ? String(digit)
  : `${digit}|${[O, S, A, B].map((bit, index) => flags & bit ? "OSAB"[index] : "").join("")}`;

export function compileGijswijtMachine(threshold: number): ProjectData {
  if (!Number.isSafeInteger(threshold) || threshold < 0) {
    throw new Error("请输入大于或等于 0 的整数阈值。");
  }
  // Expansion is cubic in the threshold; check before allocating the alphabet.
  // This is a rule-table memory budget, not a sequence-length or step limit.
  if (threshold > 16) throw new Error("本次转换支持 0–16 的阈值；更大阈值会生成过大的规则表。");
  const lines = [
    `# Gijswijt threshold=${threshold}`,
    "# 0=未写入；数字=数列项；|O/S/A/B=计算标记；#数字=本轮最大重复次数",
    "# 转换仅展开规则；数列项由图灵机运行时比较后缀计算。",
  ];
  const seen = new Set<string>();
  const rule = (state: string, read: string, next: string, write = read, direction: Direction = "N") => {
    const key = `${state},${read}`;
    if (seen.has(key)) throw new Error(`编译器产生重复规则：${key}`);
    seen.add(key);
    lines.push(`${state},${read} -> ${next},${write},${direction}`);
  };
  const cells: Cell[] = [];
  for (let digit = 1; digit <= threshold; digit += 1) {
    for (let flags = 0; flags < 16; flags += 1) cells.push({ digit, flags, text: symbol(digit, flags) });
  }
  const each = (_state: string, fn: (cell: Cell) => void) => {
    for (const cell of cells) fn(cell);
  };
  const sweep = (state: string, direction: Direction, next = state) =>
    each(state, (cell) => rule(state, cell.text, next, cell.text, direction));

  rule("G.seed", "0", threshold === 0 ? "G.HALT" : "G.fence", "1", threshold === 0 ? "N" : "L");
  if (threshold > 0) {
    rule("G.fence", "0", "G.end", "#1", "R");
    sweep("G.end", "R");
    rule("G.end", "0", "G.origin", "0", "L");
    rule("G.next", "0", "G.origin", "0", "L");
    each("G.origin", (c) => rule("G.origin", c.text, "G.trial", symbol(c.digit, c.flags | O)));
    each("G.trial", (c) => {
      if (c.flags & O) rule("G.trial", c.text, "G.markB", symbol(c.digit, c.flags | S), "L");
    });
    each("G.markB", (c) => rule("G.markB", c.text, "G.endA", symbol(c.digit, c.flags | B), "R"));
    for (let best = 1; best <= threshold; best += 1) rule("G.markB", `#${best}`, "G.cleanL.1");
    sweep("G.endA", "R");
    rule("G.endA", "0", "G.markA", "0", "L");
    each("G.markA", (c) => rule("G.markA", c.text, "G.compare.1", symbol(c.digit, c.flags | A)));

    for (let count = 1; count <= threshold; count += 1) {
      const compare = `G.compare.${count}`;
      each(compare, (c) => {
        if (c.flags & A) rule(compare, c.text, `G.findB.${count}.${c.digit}.${c.flags & S ? 1 : 0}`, c.text, "L");
      });
      for (let digit = 1; digit <= threshold; digit += 1) {
        for (const boundary of [0, 1]) {
          const state = `G.findB.${count}.${digit}.${boundary}`;
          each(state, (c) => {
            if (!(c.flags & B)) rule(state, c.text, state, c.text, "L");
            else if (c.digit !== digit) rule(state, c.text, `G.cleanL.${count}`);
            // The first term above T is exactly T+1: deleting the last symbol
            // of Y^k leaves a rotated block repeated k-1 times, so curling
            // numbers can increase by at most one along their own sequence.
            else if (boundary && count === threshold) rule(state, c.text, "G.stopL");
            else {
              const nextCount = count + boundary;
              const flags = (c.flags & ~B) | (boundary ? S : 0);
              rule(state, c.text, `G.moveB.${nextCount}.${boundary}`, symbol(c.digit, flags), "L");
            }
          });
        }
      }
      for (const boundary of [0, 1]) {
        const moveB = `G.moveB.${count}.${boundary}`;
        each(moveB, (c) => rule(moveB, c.text, `G.returnA.${count}.${boundary}`, symbol(c.digit, c.flags | B), "R"));
        for (let best = 1; best <= threshold; best += 1) rule(moveB, `#${best}`, `G.cleanL.${count}`);
        const returnA = `G.returnA.${count}.${boundary}`;
        each(returnA, (c) => {
          if (c.flags & A) rule(returnA, c.text, `G.moveA.${count}`, symbol(c.digit, c.flags & ~A & (boundary ? ~S : -1)), "L");
          else rule(returnA, c.text, returnA, c.text, "R");
        });
      }
      each(`G.moveA.${count}`, (c) => rule(`G.moveA.${count}`, c.text, compare, symbol(c.digit, c.flags | A)));
      sweep(`G.cleanL.${count}`, "L");
      for (let best = 1; best <= threshold; best += 1) {
        rule(`G.cleanL.${count}`, `#${best}`, "G.cleanR", `#${Math.max(best, count)}`, "R");
      }
    }

    each("G.cleanR", (c) => rule("G.cleanR", c.text, "G.cleanR", symbol(c.digit, c.flags & O), "R"));
    rule("G.cleanR", "0", "G.findO", "0", "L");
    each("G.findO", (c) => {
      if (c.flags & O) rule("G.findO", c.text, "G.shiftO", symbol(c.digit), "L");
      else rule("G.findO", c.text, "G.findO", c.text, "L");
    });
    each("G.shiftO", (c) => rule("G.shiftO", c.text, "G.trial", symbol(c.digit, O)));
    for (let best = 1; best <= threshold; best += 1) {
      rule("G.shiftO", `#${best}`, `G.append.${best}`, "#1", "R");
      sweep(`G.append.${best}`, "R");
      rule(`G.append.${best}`, "0", "G.next", String(best), "R");
      rule("G.stopL", `#${best}`, "G.stopR", "0", "R");
    }
    sweep("G.stopL", "L");
    each("G.stopR", (c) => rule("G.stopR", c.text, "G.stopR", symbol(c.digit), "R"));
    rule("G.stopR", "0", "G.HALT", String(threshold + 1));
  }
  return {
    format: "turing-machine-simulator", version: 1,
    name: `吉斯维杰特数列（超过 ${threshold} 停机）`,
    description: "单纸带规则逐格比较重复后缀；0 表示未写入。",
    input: "", blankSymbol: "0", initialState: "G.seed",
    acceptStates: "", rejectStates: "", haltStates: "G.HALT",
    maxSteps: null, speed: 1000, rules: lines.join("\n"),
  };
}

/** Presentation only: read the numeric track without changing the machine. */
export function readGijswijtOutput(tape: Tape): number[] {
  return tape.entries().filter(([position]) => position >= 0)
    .map(([, text]) => Number(text.split("|")[0]));
}
