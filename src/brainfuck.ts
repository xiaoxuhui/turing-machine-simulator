import type { ExampleProject } from "./examples";
import type { Tape } from "./core";
import { TapeStackProgram, type TapeStack } from "./tape-stack-program";

export const bfStart = "bf.start";
export const bfBlank = "|";
const values = Array.from({ length: 256 }, (_, value) => String(value));
const stack = (name: string, entries: readonly string[] = values): TapeStack => ({ name, values: entries });
const inputToken = (byte: number) => `b#(${byte})`;
const outputPrefix = "#(O)";

export const bfPresets = {
  letter: { name: "循环输出 A", source: "++++++++[>++++++++<-]>+.", input: "" },
  hello: { name: "Hello World", source: "++++++++++[>+++++++>++++++++++>+++>+<<<<-]>++.>+.+++++++..+++.>++.<<+++++++++++++++.>.+++.------.--------.>+.>.", input: "" },
  echo: { name: "输入回显", source: ",[.,]", input: "Hello, BF!" },
  multiply: { name: "2 × 3，输出字节 6", source: "++[>+++<-]>.", input: "" },
  wrap: { name: "字节回绕 0 → 255 → 0", source: "-.+.", input: "" },
  unary: { name: "一进制加一：111 → 1111", source: ",[.,]+++++++[>+++++++<-]>.", input: "111" },
} as const;

function instructions(source: string) {
  const code: string[] = [], pending: Array<{ index: number; line: number; column: number }> = [];
  const pairs = new Map<number, number>();
  let line = 1, column = 0;
  for (const char of source) {
    column++;
    if (char === "\n") { line++; column = 0; }
    if (!"<>+-.,[]".includes(char)) continue;
    const index = code.length;
    code.push(char);
    if (char === "[") pending.push({ index, line, column });
    if (char === "]") {
      const open = pending.pop();
      if (!open) throw new Error(`第 ${line} 行第 ${column} 列：] 没有对应的 [。`);
      pairs.set(index, open.index); pairs.set(open.index, index);
    }
  }
  const open = pending.at(-1);
  if (open) throw new Error(`第 ${open.line} 行第 ${open.column} 列：[ 没有对应的 ]。`);
  if (code.length > 10_000) throw new Error("BF 指令过长，请先使用不超过 10000 条指令的程序。");
  return { code, pairs };
}

/** Compile control flow only. All byte arithmetic, pointer movement and I/O run on the tape. */
export function makeBrainfuckProject(source: string, input = ""): ExampleProject {
  const { code, pairs } = instructions(source);
  const bytes = new TextEncoder().encode(input);
  if (bytes.length > 4096) throw new Error("输入过长，请先使用不超过 4096 字节的输入。");
  const p = new TapeStackProgram("bf", "F", "H", "R", value => value, bfBlank);
  const raw = stack("I", values.map(value => inputToken(Number(value)))), stream = stack("S", raw.values);
  const head = stack("C"), left = stack("L"), right = stack("R");
  const labels = Array.from({ length: code.length + 1 }, (_, i) => `F.p${i}`);
  const continuation = stack("K", labels.map((_, i) => String(i)));
  const resume = p.label();
  p.take(continuation, value => labels[Number(value)], "R", resume);
  p.jump(labels[code.length], p.end);

  const zero = (next: string) => p.push(head, "0", next);
  const change = (delta: number) => p.take(head, value => p.push(head, String((Number(value) + delta + 256) % 256), resume), "R");
  const move = (destination: TapeStack, source: TapeStack) => {
    const pop = p.take(source, value => p.push(head, value, resume), zero(resume));
    return p.take(head, value => p.push(destination, value, pop), "R");
  };
  const isZero = (yes: string, no: string) => p.peek(head, value => value === "0" ? yes : no, "R");

  const operations = new Map<string, string>();
  if (code.includes("+")) operations.set("+", change(1));
  if (code.includes("-")) operations.set("-", change(-1));
  if (code.includes(">")) operations.set(">", move(left, right));
  if (code.includes("<")) operations.set("<", move(right, left));
  if (code.includes(",")) {
    const read = p.take(stream, value => p.push(head, value.slice(3, -1), resume), zero(resume));
    operations.set(",", p.clear(head, read));
  }
  if (code.includes(".")) {
    operations.set(".", p.peek(head, value => p.emit(outputPrefix + value, resume), "R"));
  }

  p.note("BF：8 位无符号单元，0～255 回绕；纸带双向延伸，新单元为 0，输入结束后逗号读入 0。");
  p.note("每个单元直接用一格字节表示；C 是当前单元，L/R 是左右单元，K 保存续接位置。加减直接原位改写，不拆位、不搬到临时区再还原。");
  p.note("输出区每格记录一个字节，O 隐藏标记保留身份；字符输出只解码纸带上的字节，不执行 BF。");
  for (const [index, command] of code.entries()) {
    const label = labels[index], next = labels[index + 1];
    p.note(`指令 ${index + 1} ${command}，入口 ${label}。`);
    if (command === "[" || command === "]") {
      const other = labels[pairs.get(index)! + 1];
      p.jump(label, isZero(command === "[" ? other : next, command === "[" ? next : other));
    } else p.push(continuation, String(index + 1), operations.get(command)!, label);
  }
  p.readInput(raw, p.move(raw, stream, zero(labels[0])));
  return {
    category: "基础示例", name: "Brainfuck（BF）", description: "八条 BF 指令编译成普通图灵机规则；空白符 |，字节 0～255 回绕，输入输出采用 UTF-8。可在 BF 面板修改源码后重新转换。",
    rules: "# bf " + JSON.stringify({ source, input }) + "\n" + p.finish(), ruleGuide: p.ruleGuide,
    brainfuckSource: { source, input },
    input: Array.from(bytes, inputToken).join(""),
    initialState: bfStart, blankSymbol: bfBlank, haltStates: "H", acceptStates: "", rejectStates: "R", maxSteps: null,
  };
}

export function readBrainfuckSource(rules: string): { source: string; input: string } | undefined {
  if (!rules.startsWith("# bf ")) return undefined;
  try {
    const value = JSON.parse(rules.slice(5, rules.indexOf("\n")));
    if (typeof value?.source === "string" && typeof value?.input === "string") return value;
  } catch { /* Edited programs can omit the optional source header. */ }
}

export function readBrainfuckOutput(tape: Tape): { bytes: number[]; text: string } {
  const bytes = tape.entries().flatMap(([, symbol]) => {
    if (!symbol.startsWith(outputPrefix)) return [];
    const value = Number(symbol.slice(outputPrefix.length));
    return Number.isInteger(value) && value >= 0 && value < 256 ? [value] : [];
  });
  return { bytes, text: new TextDecoder().decode(new Uint8Array(bytes)) };
}
