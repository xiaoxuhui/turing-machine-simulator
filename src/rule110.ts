import { wordChar, type Word } from "./rule110-word";

export interface Rule110Initial { left: Word; center: Word; right: Word }
export const rule110Bit = (left: number, middle: number, right: number): number => (110 >> ((left << 2) | (middle << 1) | right)) & 1;
const modulo = (value: bigint, length: bigint) => (value % length + length) % length;
export function rule110InitialBit(initial: Rule110Initial, position: bigint): number {
  if (!initial.left.length || !initial.right.length) throw new Error("左右周期不能为空。");
  if (position < 0n) return Number(wordChar(initial.left, modulo(position, initial.left.length)));
  if (position < initial.center.length) return Number(wordChar(initial.center, position));
  return Number(wordChar(initial.right, (position - initial.center.length) % initial.right.length));
}

/** Finite causal cone: each row shrinks by one cell on both sides. No wrapping. */
export function* rule110Rows(initial: Rule110Initial, origin: bigint, width: number, steps: number): Generator<Uint8Array> {
  if (!Number.isSafeInteger(width) || width < 1 || width > 2048 || !Number.isSafeInteger(steps) || steps < 0 || steps > 4096) throw new Error("预览宽度须为 1–2048，预览步数须为 0–4096。");
  let row = Uint8Array.from({ length: width + 2 * steps }, (_, index) => rule110InitialBit(initial, origin + BigInt(index - steps)));
  yield row.slice(steps, steps + width);
  for (let time = 1; time <= steps; time++) {
    const next = new Uint8Array(row.length - 2);
    for (let index = 0; index < next.length; index++) next[index] = rule110Bit(row[index], row[index + 1], row[index + 2]);
    row = next;
    yield row.slice(steps - time, steps - time + width);
  }
}
