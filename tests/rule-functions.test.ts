import { describe, expect, it } from "vitest";
import { inputToTape, parseTransitions, resolveInitialState, TuringMachine, type ParseOptions } from "../src/core";

const append = `追加(q0):
    q0,1 -> q0,1,R
    q0,□ -> HALT,1,R`;

function execute(source: string, input = "111", initial = "q0", options: ParseOptions = {}) {
  const parsed = parseTransitions(source, options);
  expect(parsed.errors).toEqual([]);
  const machine = new TuringMachine({
    blankSymbol: "□", initialState: resolveInitialState(parsed, initial),
    acceptStates: options.acceptStates ?? ["ACCEPT"], rejectStates: options.rejectStates ?? ["REJECT"],
    haltStates: options.haltStates ?? ["HALT"], transitions: parsed.transitions,
  }, inputToTape(input, "□"));
  let result;
  for (let step = 0; step < 10_000; step++) {
    result = machine.step();
    if (result.stopped) break;
  }
  return { machine, result, parsed, output: machine.tape.entries().map(([, s]) => s).join("") };
}

describe("indented rule functions", () => {
  it("calls a Chinese function by name twice, including calls before definitions", () => {
    const { output, machine, parsed } = execute(`追加\n追加\n\n${append}`);
    expect(output).toBe("11111");
    expect(machine.currentState).toBe("HALT");
    expect(machine.stepCount).toBe(5);
    expect(parsed.hasFunctions).toBe(true);
  });
  it("supports every small input for repeated calls without a runtime arithmetic shortcut", () => {
    for (let size = 0; size <= 8; size++) for (let count = 1; count <= 5; count++) {
      const { output, machine } = execute(`${append}\n${Array(count).fill("追加").join("\n")}`, "1".repeat(size));
      expect(output).toBe("1".repeat(size + count));
      expect(machine.stepCount).toBe(size + count);
    }
  });
  it("isolates identical local states in different functions", () => {
    const source = `${append}\n写二(q0):\n    q0,□ -> HALT,2,R\n追加\n写二`;
    expect(execute(source, "").output).toBe("12");
  });
  it("allows selecting a function in the initial-state field without a top-level call", () => {
    expect(execute(append, "111", "追加").output).toBe("1111");
  });
  it("supports tail calls from ordinary rules and functions", () => {
    expect(execute(`${append}\nstart,□ -> 追加,□,N`, "", "start").output).toBe("1");
    expect(execute(`${append}\n入口(s):\n    s,□ -> 追加,□,N\n入口`, "").output).toBe("1");
  });
  it("supports nested sequential composition and forward references", () => {
    const source = `四次(开始):\n    两次\n    两次\n两次(开始):\n    追加\n    追加\n${append}\n四次`;
    expect(execute(source, "").output).toBe("1111");
  });
  it("uses configured halt states, and accept/reject still terminate the program", () => {
    expect(execute(`写(q):\n    q,□ -> 完成,1,R\n写\n写`, "", "q", { haltStates: ["完成"] }).output).toBe("11");
    for (const state of ["ACCEPT", "REJECT"]) {
      const { machine } = execute(`停止(q):\n    q,□ -> ${state},1,R\n${append}\n停止\n追加`, "");
      expect(machine.currentState).toBe(state);
      expect(machine.stepCount).toBe(1);
    }
  });
  it("does not treat a missing transition or undefined local target as a return", () => {
    const { result } = execute(`少规则(q):\n    q,1 -> HALT,1,N\n少规则\n${append}\n追加`, "");
    expect(result?.reason).toBe("missing-transition");
    expect(execute(`缺状态(q):\n    q,□ -> typo,1,N\n缺状态`, "").result?.reason).toBe("missing-transition");
  });
  it("keeps comments and original source line numbers in diagnostics", () => {
    const errors = parseTransitions(`# 注释\n\n函数(q):\n    # 函数注释\n    q,□ -> HALT,1,N\n    q,□ -> HALT,2,N`).errors;
    expect(errors.join()).toContain("第 6 行");
    expect(errors.join()).toContain("重复");
  });
  it.each([
    ["未知", "未定义函数"],
    ["空(q):", "不能为空"],
    ["坏(q):\n    p,□ -> HALT,1,N\n坏", "初始状态"],
    [`${append}\n${append}`, "重复定义"],
    ["坏(q):\n\tq,□ -> HALT,1,N", "Tab"],
    ["坏(q):\n    q,1 -> q,1,R\n  q,□ -> HALT,1,N", "缩进必须一致"],
    ["外(q):\n    内(p):\n        p,□ -> HALT,1,N", "不能嵌套定义"],
    [`${append}\n追加\ns,□ -> HALT,1,N`, "不能与顶格普通"],
    ["混合(q):\n    q,□ -> HALT,1,N\n    未知", "不能混写"],
    ["递归(q):\n    q,□ -> 递归,□,N\n递归", "不支持递归"],
    ["甲(q):\n    乙\n乙(q):\n    甲\n甲", "不支持递归"],
    ["HALT(q):\n    q,□ -> HALT,1,N", "函数名不能与终态"],
    ["甲(甲):\n    甲,□ -> HALT,1,N", "局部状态"],
  ])("rejects unsafe/invalid function source: %s", (source, message) => {
    expect(parseTransitions(source).errors.join()).toContain(message);
  });
  it("rejects empty halt configuration and deep or explosive composition", () => {
    expect(parseTransitions(append, { haltStates: [] }).errors.join()).toContain("普通停机态");
    const chain = Array.from({ length: 67 }, (_, n) => `f${n}(q):\n    f${n + 1}`).join("\n");
    expect(parseTransitions(`${chain}\nf67(q):\n    q,□ -> HALT,1,N`).errors.join()).toContain("深度");
    const reversed = Array.from({ length: 67 }, (_, n) => `f${n}(q):\n    f${n + 1}`).reverse().join("\n");
    expect(parseTransitions(`f67(q):\n    q,□ -> HALT,1,N\n${reversed}`).errors.join()).toContain("深度");
    const doubling = Array.from({ length: 15 }, (_, n) => `f${n}(q):\n    f${n + 1}\n    f${n + 1}`).join("\n");
    expect(parseTransitions(`${doubling}\nf15(q):\n    q,□ -> HALT,1,R\nf0`).errors.join()).toContain("超过");
  });
  it("preserves flat parsing and avoids generated-state prefix collisions", () => {
    const flat = parseTransitions("  q0,□ -> HALT,1,N");
    expect(flat.errors).toEqual([]);
    expect(flat.hasFunctions).toBeUndefined();
    const { output } = execute(`${append}\n__fn.start,□ -> 追加,□,N`, "", "__fn.start");
    expect(output).toBe("1");
  });
});
