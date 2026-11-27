import { joinWords, repeatWord, sliceWord, textWord, wordChar, type Word } from "./rule110-word";
import { rule110InitialBit, type Rule110Initial } from "./rule110";

export const GOLLY_RULE110 = "W110";
export interface Golly110Options { origin: bigint; width: number; steps: number; topology?: "unbounded" | "cylinder" }
export interface Golly110Export { text: string; extension: "mc" | "rle"; cells: string; nodes?: number; rule: string; originX: string }
export function golly110Rule(width: bigint, topology: Golly110Options["topology"] = "unbounded"): string {
  if (topology !== "cylinder") return GOLLY_RULE110;
  if (width < 1n || width > 2000000000n) throw new Error("Golly 环绕宽度须为 1–2000000000。完整图案过大时，可选择无限平面或当前视窗 RLE。");
  return `${GOLLY_RULE110}:T${width},0`;
}

function check(options: Golly110Options): void {
  if (!Number.isSafeInteger(options.width) || options.width < 1 || options.width > 2048 || !Number.isSafeInteger(options.steps) || options.steps < 0 || options.steps > 4096) throw new Error("显示格数须为 1–2048，保护步数须为 0–4096。");
}
function sample(initial: Rule110Initial, origin: bigint, count: number): Word {
  return textWord(Array.from({ length: count }, (_, index) => String(rule110InitialBit(initial, origin + BigInt(index)))).join(""));
}
function comments(originalStart: bigint, observedWidth: bigint, steps: number, y: number, seedX = 0n): string[] {
  return [
    "#C Rule 110 / Golly native W110. 1 = live, 0 = dead.",
    `#C Seed x=${seedX} corresponds to original initial-coordinate ${originalStart}.`,
    `#C Observe Golly x=${seedX + BigInt(steps)}..${seedX + BigInt(steps) + observedWidth - 1n}; generation t is on row y=${y}+t.`,
    `#C Exact agreement with the infinite periodic configuration in the observed region through generation ${steps}.`,
    "#C Finite background guards are included on both sides; beyond that horizon, enlarge the guards and export again.",
  ];
}

/** Export the displayed interval and its complete backward light cone. */
export function exportRule110Rle(initial: Rule110Initial, options: Golly110Options): Golly110Export {
  check(options);
  const start = options.origin - BigInt(options.steps), count = options.width + 2 * options.steps;
  const rule = golly110Rule(BigInt(count), options.topology), seedX = options.topology === "cylinder" ? -BigInt(Math.floor(count / 2)) : 0n;
  const bits = (sample(initial, start, count) as { text: string }).text;
  const tokens: string[] = [];
  for (let at = 0; at < bits.length;) {
    let end = at + 1; while (end < bits.length && bits[end] === bits[at]) end++;
    tokens.push((end - at === 1 ? "" : String(end - at)) + (bits[at] === "1" ? "o" : "b")); at = end;
  }
  const lines: string[] = []; let line = "";
  for (const token of tokens) { if (line.length + token.length > 70) { lines.push(line); line = ""; } line += token; }
  lines.push(line + "!");
  return { text: ["#N TM to Rule 110 - viewport with causal guards", `#CXRLE Pos=${seedX},0 Gen=0`, ...comments(start, BigInt(options.width), options.steps, 0, seedX), `x = ${count}, y = 1, rule = ${rule}`, ...lines, ""].join("\n"), extension: "rle", cells: String(count), rule, originX: String(seedX) };
}

/** Binary-row DAG → Golly's child-first 8×8-leaf quadtree. No bit expansion. */
export function binaryWordMacrocell(word: Word, centered = false): { body: string; nodes: number } {
  const lines: string[] = [], canonical = new Map<string, number>();
  const memo = new Map<string, number>(), ids = new Map<Word, number>(), nonzero = new Map<Word, boolean>();
  const id = (value: Word) => { let result = ids.get(value); if (result === undefined) { result = ids.size; ids.set(value, result); } return result; };
  const hasOne = (value: Word): boolean => {
    const known = nonzero.get(value); if (known !== undefined) return known;
    const result = value.kind === "text" ? value.text.includes("1") : value.kind === "join" ? value.parts.some(hasOne) : value.count > 0n && hasOne(value.word);
    nonzero.set(value, result); return result;
  };
  const intern = (key: string, line: string) => {
    const known = canonical.get(key); if (known !== undefined) return known;
    if (lines.length >= 350000 || memo.size >= 1000000) throw new Error("完整 Macrocell 超出当前浏览器导出预算，请改选“当前视窗 RLE”。原压缩配置仍完整保留。");
    lines.push(line); canonical.set(key, lines.length); return lines.length;
  };
  const leaf = (bits: string) => !bits.includes("1") ? 0 : intern("b" + bits, bits.replace(/0/g, ".").replace(/1/g, "*").replace(/\.+$/, "") + "$".repeat(8));
  const parent = (level: number, left: number, right: number) => !left && !right ? 0 : intern(`${level}:${left}:${right}`, `${level} ${left} ${right} 0 0`);
  const build = (value: Word, start: bigint, level: number, cyclic = false): number => {
    const size = 1n << BigInt(level);
    if (!value.length || !hasOne(value) || !cyclic && start >= value.length) return 0;
    if (cyclic) start %= value.length;
    // Descend through whole-word boundaries before memoization, so identical
    // repeated periods share the same subtree even at enormous coordinates.
    if (start + size <= value.length) {
      if (value.kind === "join") {
        let offset = 0n;
        for (const part of value.parts) {
          if (start >= offset && start + size <= offset + part.length) return build(part, start - offset, level);
          offset += part.length;
        }
      } else if (value.kind === "repeat") {
        const offset = start % value.word.length;
        return build(value.word, offset, level, offset + size > value.word.length);
      }
    }
    const key = `${cyclic ? "c" : "b"}:${id(value)}:${start}:${level}`;
    const known = memo.get(key); if (known !== undefined) return known;
    let result: number;
    if (level === 3) {
      const bits = Array.from({ length: 8 }, (_, index) => {
        const position = start + BigInt(index);
        return cyclic ? wordChar(value, position % value.length) : position < value.length ? wordChar(value, position) : "0";
      }).join("");
      result = leaf(bits);
    } else {
      const half = size / 2n;
      result = parent(level, build(value, start, level - 1, cyclic), build(value, start + half, level - 1, cyclic));
    }
    memo.set(key, result); return result;
  };
  let level = 3; while ((1n << BigInt(level)) < word.length) level++;
  if (centered) {
    // Bounded grids are centered on x=0 in Golly. Put the first half at the
    // right edge of SW, and the second half at the left edge of SE.
    const cut = word.length / 2n, side = 1n << BigInt(level);
    const left = build(joinWords([repeatWord(textWord("0"), side - cut), sliceWord(word, 0n, cut)]), 0n, level);
    const right = build(sliceWord(word, cut), 0n, level);
    lines.push(`${level + 1} 0 0 ${left} ${right}`);
  } else {
    const row = build(word, 0n, level);
    // The southeast quadrant starts at Golly (0,1); all bits lie on its top row.
    lines.push(`${level + 1} 0 0 0 ${row}`);
  }
  return { body: lines.join("\n") + "\n", nodes: lines.length };
}

/** Preserve the entire finite computation tape, plus both finite guard regions. */
export function exportRule110Macrocell(initial: Rule110Initial, options: Golly110Options): Golly110Export {
  check(options);
  const guard = options.steps, start = -BigInt(guard);
  const seed = joinWords([sample(initial, start, guard), initial.center, sample(initial, initial.center.length, guard)]);
  const rule = golly110Rule(seed.length, options.topology), centered = options.topology === "cylinder", seedX = centered ? -(seed.length / 2n) : 0n;
  const tree = binaryWordMacrocell(seed, centered);
  return { text: ["[M2] (TM Rule 110 exporter)", `#R ${rule}`, ...comments(start, initial.center.length, guard, 1, seedX), "#C This file includes ALL central data; the infinite periodic tails are represented only by the finite guards.", tree.body].join("\n"), extension: "mc", cells: String(seed.length), nodes: tree.nodes, rule, originX: String(seedX) };
}
