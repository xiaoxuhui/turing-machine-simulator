import { TapeStackProgram, type TapeStack } from "./tape-stack-program";

export const universalStart = "universal.start";
export const universalHalt = "universal.halt";
export const universalReject = "universal.invalid";

const digit = "1", endId = ".", endHeader = "|";
const rowKinds = ["T", "A", "J", "H"] as const;
const moves = ["L", "R", "N"] as const;
const codes = [digit, endId] as const;
const programAlphabet = [...codes, ...rowKinds, ...moves];
const stack = (name: string, values: readonly string[] = [digit]): TapeStack => ({ name, values });

/** A fixed interpreter. The program it executes is read exclusively from the tape. */
export function universalRules(): string {
  const p = new TapeStackProgram("universal", "U", universalHalt, universalReject);
  const raw = stack("I", [...programAlphabet, endHeader, "∞"]);
  const table = stack("P", raw.values);
  const visited = stack("V", programAlphabet);
  const fuel = stack("F"), steps = stack("N"), state = stack("S"), head = stack("H");
  const unlimited = stack("Z");
  const left = stack("L", codes), right = stack("R", codes);
  const inputReverse = stack("IR", codes);
  const candidate = stack("C"), compared = stack("M");
  const scan = p.label();
  const invalid = universalReject;

  const printStack = (source: TapeStack, next: string) => {
    const loop = p.label();
    return p.take(source, value => p.emit(value, loop), next, loop);
  };
  const printId = (source: TapeStack, next: string) => printStack(source, p.emit(endId, next));
  const print = printId(steps, printId(state, printStack(left, p.emit(endHeader,
    printId(head, p.emit(endHeader, printStack(right, p.end)))))));
  const stopped = (reason: string) => p.emit(reason, print);
  const noRule = stopped("M"), stepLimit = stopped("B");

  // Move the simulated head using two stacks whose tops are next to it.
  const popCell = (side: TapeStack, next: string) => {
    const loop = p.label();
    return p.take(side, value => value === digit ? p.push(head, digit, loop) : next, next, loop);
  };
  const shiftHead = (source: TapeStack, destination: TapeStack) =>
    p.push(destination, endId, p.move(head, destination, popCell(source, scan)));
  const movement = new Map([
    ["L", shiftHead(left, right)], ["R", shiftHead(right, left)], ["N", scan],
  ]);

  // The entries already read in this pass are stacked in reverse order.
  const readRowToken = (select: (token: string) => string, empty = invalid, from?: string) =>
    p.take(table, token => p.push(visited, token, select(token)), empty, from);
  const readId = (destination: TapeStack | undefined, next: string) => {
    const loop = p.label();
    return readRowToken(token => {
      if (token === endId) return next;
      if (token !== digit) return invalid;
      return destination ? p.push(destination, digit, loop) : loop;
    }, invalid, loop);
  };
  const compare = (reference: TapeStack, same: string, different: string) => {
    const loop = p.label();
    const mismatch = p.clear(candidate, p.move(compared, reference, different));
    const bothEmpty = p.move(compared, reference, same);
    const pair = p.take(candidate, () => p.push(compared, digit, loop), p.push(reference, digit, mismatch));
    const rest = p.peek(candidate, () => mismatch, bothEmpty);
    return readId(candidate, p.take(reference, () => pair, rest, loop));
  };

  const direction = readRowToken(token => {
    const move = movement.get(token);
    return move ? p.move(visited, table, p.push(steps, digit, move)) : invalid;
  });
  const apply = p.clear(state, readId(state, p.clear(head, readId(head, direction))));
  const paid = p.peek(unlimited, () => apply, p.take(fuel, () => apply, stepLimit));
  const skipDirection = readRowToken(token => movement.has(token) ? scan : invalid);
  const skipWrite = readId(undefined, skipDirection);
  const skipNext = readId(undefined, skipWrite);
  const checkRead = compare(head, paid, skipNext);
  const work = compare(state, checkRead, readId(undefined, skipNext));
  const terminalRows = new Map(rowKinds.slice(1).map(kind => [kind, compare(state, stopped(kind), scan)]));
  p.note("从表头扫描：比较当前状态和读到的符号，相符时才改写纸带，并恢复规则表。");
  readRowToken(token => token === "T" ? work : terminalRows.get(token as "A" | "J" | "H") ?? invalid, noRule, scan);

  // Input packet is fuel | state. first-cell. remaining-cells. | rules.
  const tail = p.label();
  p.take(table, token => token === endHeader ? p.move(inputReverse, right, scan)
    : token === digit || token === endId ? p.push(inputReverse, token, tail) : invalid, invalid, tail);
  const first = p.label();
  p.take(table, token => token === endHeader ? scan : token === endId ? tail
    : token === digit ? p.push(head, digit, first) : invalid, invalid, first);
  const initial = p.label();
  p.take(table, token => token === endId ? first : token === digit ? p.push(state, digit, initial) : invalid, invalid, initial);
  const budget = p.label();
  p.take(table, token => token === endHeader ? initial : token === digit ? p.push(fuel, digit, budget)
    : token === "∞" ? p.push(unlimited, digit, budget) : invalid, invalid, budget);
  p.note("读入编码：剩余步数、初态、原始纸带、规则表都来自输入。");
  p.readInput(raw, p.move(raw, table, budget));
  return p.finish();
}
