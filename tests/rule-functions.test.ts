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
  it("binds a local child-function alias and returns into the parent scope", () => {
    const source = `写一(s,after):\n    s,□ -> after,1,R\n父(q0,out, 写=写一):\n    q0,□ -> 写,□,N\n    after,□ -> out,2,R\nstart,□ -> 父,□,N\nout,□ -> HALT,3,N`;
    const { output, machine } = execute(source, "", "start");
    expect(output).toBe("123");
    expect(machine.stepCount).toBe(5);
  });
  it("accepts bare child names in a composite function header", () => {
    const source = `写(s,after):\n    s,□ -> after,1,R\n两次(入,done,写):\n    写\n    写\n两次\ndone,□ -> HALT,2,N`;
    expect(execute(source, "").output).toBe("112");
  });
  it("exports identical local names without colliding with each other or outer states", () => {
    const source = `甲(s,done):\n    s,□ -> q,□,N\n    q,□ -> done,1,R\n    返回状态 q\n乙(s,done):\n    s,□ -> q,□,N\n    q,□ -> done,2,R\n    返回状态: q\nq,□ -> HALT,9,N\ndone,□ -> HALT,3,N`;
    const a = execute(source, "", "甲.q"), b = execute(source, "", "乙.q");
    expect(a.output).toBe("13");
    expect(b.output).toBe("23");
    expect(execute(source, "", "q").output).toBe("9");
    expect(a.parsed.stateExports?.map(item => item.name)).toEqual(["甲.q", "乙.q"]);
    const states = a.parsed.stateExports?.map(item => item.state) ?? [];
    expect(new Set(states).size).toBe(2);
    expect(states).not.toContain("q");
    expect(execute(`${source}\nstart,□ -> 甲.q,□,N`, "", "start").output).toBe("13");
  });
  it("extends exported state rules for every repeated invocation, not just one copy", () => {
    const source = `写(s,done):\n    s,□ -> private,□,N\n    返回状态 private\n写.private,□ -> done,1,R\n写\n写`;
    const { output, machine } = execute(source, "");
    expect(output).toBe("11");
    expect(machine.stepCount).toBe(4);
    for (let count = 1; count <= 5; count++) {
      const program = source.slice(0, source.lastIndexOf("\n写\n写")) + `\n${Array(count).fill("写").join("\n")}`;
      expect(execute(program, "").output).toBe("1".repeat(count));
    }
  });
  it("continues qualified local exports within their own invocation", () => {
    const source = `写(s,done):\n    s,□ -> a,□,N\n    返回状态 a,b\n写.a,□ -> 写.b,1,R\n写.b,□ -> done,2,R\n写\n写`;
    expect(execute(source, "").output).toBe("1212");
  });
  it("exposes composite entries and exit aliases without changing their contexts", () => {
    const source = `写(s,after):\n    s,□ -> after,1,R\n组合(入,done,写):\n    写\n    返回状态 入\nstart,□ -> 组合.入,□,N\ndone,□ -> HALT,2,N`;
    expect(execute(source, "", "start").output).toBe("12");
    const exit = `写(s,done):\n    s,□ -> done,1,R\n    返回状态 done\n写.done,□ -> HALT,2,N\n写`;
    expect(execute(exit, "").output).toBe("12");
  });
  it("avoids exported names that resemble the generated namespace", () => {
    const source = `__fn(s,done):\n    s,□ -> q,□,N\n    返回状态 q\n__fn.q,□ -> done,1,R\nstart,□ -> __fn,□,N\ndone,□ -> HALT,2,N`;
    expect(execute(source, "", "start").output).toBe("12");
  });
  it("isolates repeated exported-state invocations for several namespace-like names", () => {
    for (const name of ["写", "__fn", "__proto__", "constructor"]) for (let count = 1; count <= 4; count++) {
      const source = `${name}(s,done):\n    s,□ -> q,□,N\n    返回状态 q\n${name}.q,□ -> done,1,R\n${Array(count).fill(name).join("\n")}`;
      const { output, machine } = execute(source, "");
      expect(output).toBe("1".repeat(count));
      expect(machine.stepCount).toBe(count * 2);
    }
  });
  it("returns from a rule call to the declared outer state instead of halting", () => {
    const source = `写(q0,q1):\n    q0,□ -> q1,1,R\nq0,□ -> 写,□,N\nq1,□ -> HALT,2,N`;
    const { output, machine } = execute(source, "");
    expect(output).toBe("12");
    expect(machine.stepCount).toBe(3);
  });
  it("continues outer exit rules after a bare call or selected function entry", () => {
    const source = `写(q0,q1):\n    q0,□ -> q1,1,R\nq1,□ -> HALT,2,N`;
    expect(execute(`${source}\n写`, "").output).toBe("12");
    expect(execute(source, "", "写").output).toBe("12");
  });
  it("returns a subfunction into the matching local state of its caller", () => {
    const source = `子(s,after):\n    s,□ -> after,1,R\n父(q0,out):\n    q0,□ -> 子,□,N\n    after,□ -> out,2,R\nstart,□ -> 父,□,N\nout,□ -> HALT,3,N`;
    const { output, machine } = execute(source, "", "start");
    expect(output).toBe("123");
    expect(machine.stepCount).toBe(5);
  });
  it("returns at an explicit exit state, with spaces around the state parameters", () => {
    const source = `追加( q0 , 结束 ):\n    q0,1 -> q0,1,R\n    q0,□ -> 结束,1,R\n追加\n追加`;
    const { output, machine } = execute(source);
    expect(output).toBe("11111");
    expect(machine.currentState).toBe("HALT");
    expect(machine.stepCount).toBe(5);
  });
  it("keeps non-exit HALT as a whole-program stop when an exit is explicit", () => {
    const source = `停止(q, 结束):\n    q,□ -> HALT,1,R\n${append}\n停止\n追加`;
    const { output, machine } = execute(source, "");
    expect(output).toBe("1");
    expect(machine.stepCount).toBe(1);
  });
  it("preserves acceptance precedence in legacy functions when terminal lists overlap", () => {
    const source = `接受(q):\n    q,□ -> ACCEPT,1,R\n${append}\n接受\n追加`;
    const { machine, result } = execute(source, "", "q", { haltStates: ["HALT", "ACCEPT"] });
    expect(machine.stepCount).toBe(1);
    expect(result?.reason).toBe("accept");
  });
  it("supports explicit exits in nested composition with custom final halt states", () => {
    const source = `写(q, 出):\n    q,□ -> 出,1,R\n两次(入, 出):\n    写\n    写\n两次\n两次`;
    const { output, machine } = execute(source, "", "q", { haltStates: ["完成"] });
    expect(output).toBe("1111");
    expect(machine.currentState).toBe("完成");
  });
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
    ["子(s,end):\n    s,□ -> end,1,N\n父(q,out,x=子):\n    q,□ -> out,1,N\n    返回状态 x\n父.x,□ -> HALT,2,N", "不能与子函数名或别名"],
    ["甲(q,out,不存在):\n    q,□ -> out,1,N", "未定义子函数"],
    ["甲(q,out,x=甲,x=甲):\n    q,□ -> out,1,N", "别名 x 重复"],
    ["甲(q,out,q=甲):\n    q,□ -> out,1,N", "与状态冲突"],
    ["甲(q,out,x=甲):\n    q,□ -> x,1,N", "不支持递归"],
    ["甲(q,out):\n    q,□ -> out,1,N\n    返回状态 不存在", "未在函数内使用"],
    ["甲(q,out):\n    q,□ -> out,1,N\n    返回状态 q,q", "重复导出"],
    ["甲(q,out):\n    q,□ -> out,1,N\nstart,□ -> 甲.q,□,N", "未导出"],
    ["甲(q,out):\n    q,□ -> out,1,N\n    返回状态 q\n甲.q,□ -> HALT,2,N", "合并后与已有规则重复"],
    ["坏(q,q):\n    q,□ -> q,1,N", "不能相同"],
    ["坏(q,出):\n    q,□ -> 出,1,N\n    出,□ -> q,1,N", "退出状态不能再定义"],
    ["坏(q,ACCEPT):\n    q,□ -> ACCEPT,1,N", "接受或拒绝"],
    ["甲(q,乙):\n    q,□ -> 乙,1,N\n乙(q):\n    q,□ -> HALT,1,N", "退出状态不能与函数名"],
    ["未知", "未定义函数"],
    ["空(q):", "不能为空"],
    ["坏(q):\n    p,□ -> HALT,1,N\n坏", "初始状态"],
    [`${append}\n${append}`, "重复定义"],
    ["坏(q):\n\tq,□ -> HALT,1,N", "Tab"],
    ["坏(q):\n    q,1 -> q,1,R\n  q,□ -> HALT,1,N", "缩进必须一致"],
    ["外(q):\n    内(p):\n        p,□ -> HALT,1,N", "不能嵌套定义"],
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
