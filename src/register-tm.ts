import type { Direction } from "./core";

export type RegisterInstruction =
  | { kind: "inc"; register: number; next: string }
  | { kind: "dec"; register: number; positive: string; zero: string }
  | { kind: "jump"; next: string }
  | { kind: "halt" | "reject" };

/** Compile finite program structure; no register values are evaluated here. */
export function compileRegisterMachine(
  instructions: ReadonlyMap<string, RegisterInstruction>, entry: string,
  registers: number, result: number, operator: string,
): string {
  if (!Number.isInteger(registers) || registers < 2 || result < 0 || result >= registers || !instructions.has(entry)) throw new Error("无效寄存器程序");
  if (!["/", "^", "^^", "^^^", "+"].includes(operator)) throw new Error("不支持的输入分隔符");
  for (const instruction of instructions.values()) {
    if ("register" in instruction && (!Number.isInteger(instruction.register) || instruction.register < 0 || instruction.register >= registers)) throw new Error("寄存器越界");
    const targets = instruction.kind === "dec" ? [instruction.positive, instruction.zero] : "next" in instruction ? [instruction.next] : [];
    if (targets.some((target) => !instructions.has(target))) throw new Error("跳转目标不存在");
  }
  const lines = ["# 一进制寄存器程序展开为普通单纸带规则；运行时才计算数值。", "# 输入右侧清空；左侧 | 分隔寄存器、# 为原点；停机后只留下答案。"];
  const seen = new Set<string>();
  const add = (state: string, read: string, next: string, write = read, direction: Direction = "N") => {
    const key = `${state},${read}`;
    if (seen.has(key)) throw new Error(`重复编译规则：${key}`);
    seen.add(key);
    lines.push(`${state},${read} -> ${next},${write},${direction}`);
  };
  const backStates = new Map<string, string>();
  const back = (next: string) => {
    const existing = backStates.get(next);
    if (existing) return existing;
    const state = `return.${backStates.size}`;
    backStates.set(next, state);
    for (const symbol of ["1", "|", "□"]) add(state, symbol, state, symbol, "R");
    add(state, "#", next);
    return state;
  };
  const locate = (prefix: string, register: number) => {
    const op = `${prefix}.op`;
    add(prefix, "#", register ? `${prefix}.seek${register}` : op, "#", "L");
    for (let left = register; left > 0; left -= 1) {
      const state = `${prefix}.seek${left}`;
      add(state, "1", state, "1", "L");
      add(state, "|", left === 1 ? op : `${prefix}.seek${left - 1}`, "|", "L");
    }
    return op;
  };
  const increment = (prefix: string, register: number, next: string) => {
    const op = locate(prefix, register);
    add(op, "1", op, "1", "L");
    add(op, "|", `${prefix}.carryBar`, "1", "L");
    for (const carry of ["1", "|"]) {
      const state = `${prefix}.carry${carry === "1" ? "One" : "Bar"}`;
      for (const read of ["1", "|"]) add(state, read, `${prefix}.carry${read === "1" ? "One" : "Bar"}`, carry, "L");
      add(state, "□", back(next), carry, "R");
    }
  };

  for (const [label, instruction] of instructions) {
    const state = `I.${label}`;
    if (instruction.kind === "inc") increment(state, instruction.register, `I.${instruction.next}`);
    else if (instruction.kind === "dec") {
      const op = locate(state, instruction.register);
      add(op, "|", back(`I.${instruction.zero}`));
      add(op, "1", `${state}.take`, "□", "L");
      for (const read of ["1", "|"]) {
        add(`${state}.take`, read, `${state}.put${read === "1" ? "One" : "Bar"}`, "□", "R");
        add(`${state}.put${read === "1" ? "One" : "Bar"}`, "□", `${state}.skipHole`, read, "L");
      }
      add(`${state}.skipHole`, "□", `${state}.take`, "□", "L");
      add(`${state}.take`, "□", back(`I.${instruction.positive}`), "□", "R");
    } else if (instruction.kind === "jump") add(state, "#", `I.${instruction.next}`);
    else add(state, "#", instruction.kind === "halt" ? "clean.0.0" : "REJECT", "#", instruction.kind === "halt" ? "L" : "N");
  }

  // Build an empty register array to the left of the fixed origin.
  const inputSymbols = ["1", "0", "+", "-", "*", "/", "^", "?", "□", "#", "|", "a", "b"];
  for (const read of inputSymbols) add("BOOT", read, "init.fence", read, "L");
  add("init.fence", "□", "init.0", "#", "L");
  for (let i = 0; i < registers; i += 1) add(`init.${i}`, "□", i === registers - 1 ? "init.back" : `init.${i + 1}`, "|", i === registers - 1 ? "R" : "L");
  add("init.back", "|", "init.back", "|", "R");
  add("init.back", "#", "validate.a", "#", "R");
  const validate = (state: string, actions: Record<string, [string, Direction]>) => {
    for (const read of inputSymbols) {
      const [next, direction] = actions[read] ?? ["REJECT", "N"];
      add(state, read, next, read, direction);
    }
  };
  validate("validate.a", { "1": ["validate.a", "R"], [operator[0]]: [operator.length === 1 ? "validate.b" : "validate.op1", "R"] });
  for (let i = 1; i < operator.length; i += 1) validate(`validate.op${i}`, { [operator[i]]: [i === operator.length - 1 ? "validate.b" : `validate.op${i + 1}`, "R"] });
  validate("validate.b", { "1": ["validate.b", "R"], "□": ["validate.rewind", "L"] });
  for (const read of ["1", operator[0]]) add("validate.rewind", read, "validate.rewind", read, "L");
  add("validate.rewind", "#", "parse.A");
  for (const [name, register] of [["A", 0], ["B", 1]] as const) {
    add(`parse.${name}`, "#", `parse.scan${name}`, "#", "R");
    add(`parse.scan${name}`, "1", `parse.seek${name}`, name.toLowerCase(), "L");
    for (const read of ["1", "a", "b", operator[0]]) add(`parse.seek${name}`, read, `parse.seek${name}`, read, "L");
    add(`parse.seek${name}`, "#", `parse.inc${name}`);
    increment(`parse.inc${name}`, register, `parse.${name}`);
  }
  add("parse.scanA", "a", "parse.scanA", "a", "R");
  add("parse.scanA", operator[0], "parse.scanB");
  for (const read of ["a", "b", operator[0]]) add("parse.scanB", read, "parse.scanB", read, "R");
  add("parse.scanB", "□", "parse.erase", "□", "L");
  for (const read of ["a", "b", operator[0]]) add("parse.erase", read, "parse.erase", "□", "L");
  add("parse.erase", "#", `I.${entry}`);

  // Discard every register except the result. Keep the origin until the last
  // sweep so blank zero registers cannot be mistaken for the end of the tape.
  for (let i = 0; i < registers; i += 1) for (const nonzero of [0, 1]) {
    const state = `clean.${i}.${nonzero}`;
    add(state, "1", `clean.${i}.${nonzero || i === result ? 1 : 0}`, i === result ? "1" : "□", "L");
    add(state, "|", i === registers - 1 ? `clean.return.${nonzero}` : `clean.${i + 1}.${nonzero}`, "□", "L");
  }
  for (const nonzero of [0, 1]) {
    const state = `clean.return.${nonzero}`;
    for (const read of ["1", "□"]) add(state, read, state, read, "R");
    add(state, "#", nonzero ? "clean.find" : "HALT", "□", nonzero ? "L" : "N");
  }
  add("clean.find", "□", "clean.find", "□", "L");
  add("clean.find", "1", "clean.start", "1", "L");
  add("clean.start", "1", "clean.start", "1", "L");
  add("clean.start", "□", "HALT", "□", "R");
  return lines.join("\n");
}
