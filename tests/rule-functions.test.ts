import { describe, expect, it } from "vitest";
import mixedCallProgram from "./fixtures/function-calls-no-ret.tm?raw";
import { inputToTape, parseTransitions, resolveInitialState, TuringMachine, type ParseOptions } from "../src/core";

const append = `追加(q0):
    q0,1 -> q0,1,R
    q0,□ -> HALT,1,R`;

function execute(source: string, input = "111", initial = "", options: ParseOptions = {}) {
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
  it.each([
    [`f(s,end):\n    s,1->end,2,R\nstart,1->f\nafter,□->HALT,3,N`, "1", "start", "23"],
    [`start,□->f\nafter,□->HALT,3,N\nf(s,end):\n    s,□->end,2,R`, "", "start", "23"],
    [`child(s,end):\n    s,□->end,1,R\nparent(s,end,c=child):\n    s,□->c\n    after,□->end,2,N\nparent`, "", "", "12"],
    [`f(s,out):\n    s,□->out,1,R\n    ret out\nstart,□->f\nout,□->HALT,4,N`, "", "start", "14"],
  ])("compiles direct calls exactly like preserving the read symbol and staying put", (source, input, initial, expected) => {
    const full = source.replace(/^([ \t]*[^,\n]+),([^,\n]+?)->([^,\n]+)$/gm, "$1,$2->$3,$2,N");
    expect(parseTransitions(source)).toEqual(parseTransitions(full));
    const result = execute(source, input, initial);
    expect(result.result?.reason).toBe("halt");
    expect(result.output).toBe(expected);
  });

  it("keeps explicit write and movement on complete calls", () => {
    const source = `f(s,end):\n    s,□->end,2,N\nstart,1->f,9,R`;
    const { machine, output, result } = execute(source, "1", "start");
    expect(result?.reason).toBe("halt");
    expect(output).toBe("92");
    expect(machine.headPosition).toBe(1);
  });

  it("still checks the read symbol on a direct call", () => {
    const source = `f(s,end):\n    s,1->end,2,N\nstart,1->f`;
    const { machine, result } = execute(source, "", "start");
    expect(result?.reason).toBe("missing-transition");
    expect(machine.stepCount).toBe(0);
  });

  it.each(["missing", "ordinary", "HALT"])("rejects incomplete ordinary transitions targeting %s", target => {
    const source = `f(s,end):\n    s,□->end,1,N\nstart,□->${target}\nordinary,□->HALT,2,N`;
    expect(parseTransitions(source).errors.join()).toContain(`第 3 行：简写调用目标 ${target} 不是已定义函数`);
  });

  const forwardFunctions = `seed(s,end):
    s,□->end,0,R
f(s,end):
    s,□->end,1,R
g(s,end):
    s,□->end,2,R`;

  it("jumps to the nearest later matching bare call and resumes below that location", () => {
    const source = `${forwardFunctions}\nseed\na,□->f,□,N\nskipped,□->HALT,9,N\ng\nf\nafter,□->HALT,3,N\nf`;
    const result = execute(source, "");
    expect(result.output).toBe("013");
    expect(result.result?.reason).toBe("halt");
    const nextF = result.parsed.internalNames!.find(item => item.source === "f" && item.context.startsWith("源码第"))!;
    const a = result.parsed.transitions.find(rule => rule.fromState.endsWith(".a"))!;
    expect(a.toState).toBe(nextF.actual);
  });

  it("calls in place when only a different function occurs later", () => {
    const source = `${forwardFunctions}\nseed\na,□->f,□,N\nb,□->g,3,R\ng`;
    expect(execute(source, "").output).toBe("0132");
  });

  it("does not search backward for a matching call", () => {
    const source = `${forwardFunctions}\nf\na,□->f,□,N\nb,□->HALT,3,N`;
    expect(execute(source, "").output).toBe("113");
  });

  it("also sends a declaration to its later bare call, skipping intervening declarations", () => {
    const source = `${forwardFunctions}\nstart,□->f,□,N\nskipped,□->HALT,9,N\ng\nf\nafter,□->HALT,3,N`;
    expect(execute(source, "", "start").output).toBe("13");
  });

  it("keeps explicit ret when jumping to a later function invocation", () => {
    const source = `f(s,out):\n    s,□->out,1,R\n    ret out\nstart,□->f,□,N\nout,□->HALT,4,N\nf\nafter,□->HALT,3,N`;
    expect(execute(source, "", "start").output).toBe("14");
  });

  it("applies the later matching call lookup to direct calls too", () => {
    const source = `${forwardFunctions}\nseed\na,□->f\nskipped,□->HALT,9,N\nf\nafter,□->HALT,3,N`;
    expect(execute(source, "").output).toBe("013");
  });

  it("exposes actual names for each call context and written source label", () => {
    const source = mixedCallProgram;
    const parsed = parseTransitions(source, { haltStates: ["H"] });
    expect(parsed.errors).toEqual([]);
    const mapping = parsed.internalNames!;
    expect(mapping.some(item => item.source === "d1" && item.actual.endsWith(".d1"))).toBe(true);
    const rEntries = new Set(mapping.filter(item => item.source === "r.q0").map(item => item.actual));
    expect(rEntries.size).toBeGreaterThan(1);
    const actualStates = new Set(parsed.transitions.flatMap(rule => [rule.fromState, rule.toState]));
    for (const item of mapping) expect(actualStates.has(item.actual), `${item.source}: ${item.actual}`).toBe(true);
    expect(resolveInitialState(parsed, "a1")).toBe("a1");
  });
  it("runs the user's no-ret program using later matching calls as jump locations", () => {
    const source = mixedCallProgram;
    const parsed = parseTransitions(source, { haltStates: ["H"] });
    expect(parsed.errors).toEqual([]);
    const machine = new TuringMachine({ blankSymbol: "0", initialState: resolveInitialState(parsed, "a1"), acceptStates: [], rejectStates: [], haltStates: ["H"], transitions: parsed.transitions }, []);
    const states: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = machine.step();
      expect(result.reason, `step ${i + 1}: ${machine.currentState}`).not.toBe("missing-transition");
      expect(result.stopped).toBe(i === 4);
      states.push(machine.currentState);
    }
    expect(states[0]).toMatch(/\.d1$/);
    expect(states[1]).toMatch(/\.r\.q0$/);
    expect(states[2]).toMatch(/\.d3$/);
    expect(states[3]).toMatch(/\.r\.q0$/);
    expect(states[4]).toBe("H");
    expect(machine.headPosition).toBe(2);
    expect(machine.tape.entries()).toEqual([]);
  });
  it("never loses a written label in 279 entry/input combinations of the user's program", () => {
    const source = mixedCallProgram;
    const parsed = parseTransitions(source, { haltStates: ["H"] });
    expect(parsed.errors).toEqual([]);
    const inputs = [""];
    for (let size = 1; size <= 4; size++) for (let bits = 0; bits < 2 ** size; bits++) inputs.push(bits.toString(2).padStart(size, "0"));
    for (const initial of ["", "a1", "a2", "a3", "d1", "d2", "d3", "r", "f"]) for (const input of inputs) {
      const machine = new TuringMachine({ blankSymbol: "0", initialState: resolveInitialState(parsed, initial), acceptStates: [], rejectStates: [], haltStates: ["H"], transitions: parsed.transitions }, inputToTape(input, "0"));
      for (let step = 0; step < 500; step++) {
        const result = machine.step();
        expect(result.reason, `${initial}/${input}, step ${step}, ${machine.currentState}`).not.toBe("missing-transition");
        if (result.stopped) break;
      }
    }
  });
  it.each([
    ["outer expression", `r(q,done):\n    q,□ -> done,1,R\nstart,□ -> r,□,N\nafter,□ -> HALT,2,N`, "start", "12", 3],
    ["source sequence", `r(q,done):\n    q,□ -> done,1,R\nfirst(q,done):\n    q,□ -> done,9,R\nfirst\nnext,□ -> r,□,N\nafter,□ -> HALT,2,N`, "first", "912", 4],
    ["bound child", `r(q,done):\n    q,□ -> done,1,R\nparent(q,end,x=r):\n    q,□ -> x,□,N\n    after,□ -> end,2,N\nparent`, "parent", "12", 3],
    ["underscore name", `move_right(q,done):\n    q,□ -> done,1,R\nstart,□ -> move_right,□,N\nafter,□ -> HALT,2,N`, "start", "12", 3],
  ] as const)("calls a function without ret from the next-state column: %s", (_label, source, initial, expected, steps) => {
    const { output, machine, result } = execute(source, "", initial);
    expect(result?.reason).toBe("halt");
    expect(output).toBe(expected);
    expect(machine.stepCount).toBe(steps);
  });
  it("honors the requested state or function and only defaults to the first call for an empty field", () => {
    const source = `甲(q,out):\n    q,□ -> out,1,R\n乙(q,out):\n    q,□ -> out,2,R\nstart,□ -> HALT,9,N\n甲\n乙`;
    expect(execute(source, "", "").output).toBe("12");
    expect(execute(source, "", "甲").output).toBe("12");
    expect(execute(source, "", "乙").output).toBe("2");
    expect(execute(source, "", "start").output).toBe("9");
    expect(execute(source, "", "unknown").result?.reason).toBe("missing-transition");
  });
  it.each(["ret", "返回状态"])("only jumps to the outer state when %s is declared inside the function", keyword => {
    const source = `写(q,out):\n    q,□ -> out,1,R\n    ${keyword} out\nstart,□ -> 写,□,N\nnext,□ -> HALT,9,N\nout,□ -> HALT,2,N`;
    expect(execute(source, "", "start").output).toBe("12");
    expect(execute(source.replace(`    ${keyword} out\n`, ""), "", "start").output).toBe("19");
  });
  it("resumes after an expression's function call and supports repeated sequential states", () => {
    const source = `写(q,out):\n    q,□ -> out,1,R\n子(q,back):\n    q,□ -> back,2,R\n写\nout,□ -> 子,□,N\nback,□ -> back,3,R\nback,□ -> HALT,4,N`;
    const { output, machine } = execute(source, "");
    expect(output).toBe("1234");
    expect(machine.stepCount).toBe(5);
  });
  it("does not let a later bare call skip an explicitly defined outer return path", () => {
    const source = `r(q0,q1):\n    q0,□ -> q1,1,R\nr\nq1,□ -> HALT,2,N\nr`;
    const { output, machine } = execute(source, "");
    expect(output).toBe("12");
    expect(machine.stepCount).toBe(2);
  });
  it("reports a missing return transition instead of jumping into a later bare call", () => {
    const source = `r(q0,q1):\n    q0,□ -> q1,1,R\nr\nq1,1 -> HALT,2,N\nr`;
    const { output, machine, result } = execute(source, "");
    expect(machine.currentState).toMatch(/\.q1$/);
    expect(machine.stepCount).toBe(1);
    expect(output).toBe("1");
    expect(result?.reason).toBe("missing-transition");
  });
  it("enters the later bare call once when an expression targets its function", () => {
    const source = `r(q0,q1):\n    q0,0 -> q1,0,R\n    q0,1 -> q1,1,R\nf(q0,q1):\n    q0,0 -> q1,1,L\n    q0,1 -> q1,0,L\nr\nq1,0 -> q2,1,N\nq1,1 -> q2,1,N\nq2,0 -> r,0,N\nq2,1 -> r,1,N\nr`;
    const parsed = parseTransitions(source, { haltStates: ["H"] });
    expect(parsed.errors).toEqual([]);
    const machine = new TuringMachine({ blankSymbol: "0", initialState: resolveInitialState(parsed, "r"), acceptStates: [], rejectStates: [], haltStates: ["H"], transitions: parsed.transitions }, inputToTape("", "0"));
    const trace: string[] = [];
    for (let i = 0; i < 4; i++) {
      expect(machine.step().stopped).toBe(i === 3);
      trace.push(machine.currentState);
    }
    expect(trace[0]).toMatch(/\.q1$/);
    expect(trace[1]).toMatch(/\.q2$/);
    expect(trace[2]).toMatch(/\.r\.q0$/);
    expect(trace[3]).toBe("H");
    expect(machine.headPosition).toBe(2);
    expect(machine.tape.read(1)).toBe("1");
    expect(machine.tape.read(2)).toBe("0");
  });
  it("preserves exported exit extensions before the next bare call", () => {
    const source = `r(q0,done):\n    q0,□ -> done,1,R\n    导出状态 done\nr\nr.done,□ -> HALT,2,N\nr`;
    const { output, machine } = execute(source, "");
    expect(output).toBe("12");
    expect(machine.stepCount).toBe(2);
  });
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
    const source = `甲(s,done):\n    s,□ -> q,□,N\n    q,□ -> done,1,R\n    导出状态 q\n    ret done\n乙(s,done):\n    s,□ -> q,□,N\n    q,□ -> done,2,R\n    导出状态: q\n    ret done\nq,□ -> HALT,9,N\ndone,□ -> HALT,3,N`;
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
    const source = `写(s,done):\n    s,□ -> private,□,N\n    导出状态 private\n写.private,□ -> done,1,R\n写\n写`;
    const { output, machine } = execute(source, "");
    expect(output).toBe("11");
    expect(machine.stepCount).toBe(4);
    for (let count = 1; count <= 5; count++) {
      const program = source.slice(0, source.lastIndexOf("\n写\n写")) + `\n${Array(count).fill("写").join("\n")}`;
      expect(execute(program, "").output).toBe("1".repeat(count));
    }
  });
  it("continues qualified local exports within their own invocation", () => {
    const source = `写(s,done):\n    s,□ -> a,□,N\n    导出状态 a,b\n写.a,□ -> 写.b,1,R\n写.b,□ -> done,2,R\n写\n写`;
    expect(execute(source, "").output).toBe("1212");
  });
  it("exposes composite entries and exit aliases without changing their contexts", () => {
    const source = `写(s,after):\n    s,□ -> after,1,R\n组合(入,done,写):\n    写\n    导出状态 入\n    ret done\nstart,□ -> 组合.入,□,N\ndone,□ -> HALT,2,N`;
    expect(execute(source, "", "start").output).toBe("12");
    const exit = `写(s,done):\n    s,□ -> done,1,R\n    导出状态 done\n    ret done\n写.done,□ -> HALT,2,N\n写`;
    expect(execute(exit, "").output).toBe("12");
  });
  it("avoids exported names that resemble the generated namespace", () => {
    const source = `__fn(s,done):\n    s,□ -> q,□,N\n    导出状态 q\n__fn.q,□ -> done,1,R\nstart,□ -> __fn,□,N\ndone,□ -> HALT,2,N`;
    expect(execute(source, "", "start").output).toBe("12");
  });
  it("isolates repeated exported-state invocations for several namespace-like names", () => {
    for (const name of ["写", "__fn", "__proto__", "constructor"]) for (let count = 1; count <= 4; count++) {
      const source = `${name}(s,done):\n    s,□ -> q,□,N\n    导出状态 q\n${name}.q,□ -> done,1,R\n${Array(count).fill(name).join("\n")}`;
      const { output, machine } = execute(source, "");
      expect(output).toBe("1".repeat(count));
      expect(machine.stepCount).toBe(count * 2);
    }
  });
  it("returns from a rule call to the declared outer state instead of halting", () => {
    const source = `写(q0,q1):\n    q0,□ -> q1,1,R\nq0,□ -> 写,□,N\nq1,□ -> HALT,2,N`;
    const { output, machine } = execute(source, "", "q0");
    expect(output).toBe("12");
    expect(machine.stepCount).toBe(3);
  });
  it("continues outer exit rules after a bare call or selected function entry", () => {
    const source = `写(q0,q1):\n    q0,□ -> q1,1,R\n    ret q1\nq1,□ -> HALT,2,N`;
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
    const { machine, result } = execute(source, "", "", { haltStates: ["HALT", "ACCEPT"] });
    expect(machine.stepCount).toBe(1);
    expect(result?.reason).toBe("accept");
  });
  it("supports explicit exits in nested composition with custom final halt states", () => {
    const source = `写(q, 出):\n    q,□ -> 出,1,R\n两次(入, 出):\n    写\n    写\n两次\n两次`;
    const { output, machine } = execute(source, "", "", { haltStates: ["完成"] });
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
    expect(execute(`写(q):\n    q,□ -> 完成,1,R\n写\n写`, "", "", { haltStates: ["完成"] }).output).toBe("11");
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
    ["甲(q,out):\n    q,□ -> out,1,N\n    导出状态 q,q", "重复导出"],
    ["甲(q,out):\n    q,□ -> out,1,N\nstart,□ -> 甲.q,□,N", "未导出"],
    ["甲(q,out):\n    q,□ -> out,1,N\n    导出状态 q\n甲.q,□ -> HALT,2,N", "合并后与已有规则重复"],
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
