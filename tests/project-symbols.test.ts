import { expect, it } from "vitest";
import { inputToTape, parseTransitions, resolveInitialState, TuringMachine } from "../src/core";
import { collectProjectSymbols, renameProjectSymbol } from "../src/project-symbols";

it("lists literal symbols and updates rules, function parameters, input and blank cells", () => {
  const project = {
    rules: "# f writes an A\r\nf(q,done,A,符号):\r\n    q,A->done,**,R\r\n    q,□->done,A,N\r\nf",
    input: "A□Z", blankSymbol: "□",
  };
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors).toEqual([]);
  const symbols = collectProjectSymbols(project, parsed);
  expect(symbols).toEqual([
    { value: "□", reads: 2, writes: 0, input: true, blank: true, parameter: false },
    { value: "A", reads: 2, writes: 2, input: true, blank: false, parameter: true },
    { value: "Z", reads: 0, writes: 0, input: true, blank: false, parameter: false },
    { value: "*", reads: 0, writes: 2, input: false, blank: false, parameter: false },
  ]);
  const named = renameProjectSymbol(project, parsed, "A", "甲");
  expect(named.rules).toContain("# f writes an A\r\nf(q,done,甲,符号):\r\n    q,甲->done,**,R");
  const renamed = renameProjectSymbol(named, parseTransitions(named.rules), "□", "空");
  const result = parseTransitions(renamed.rules);
  expect(result.errors).toEqual([]);
  expect(renamed.input).toBe("甲空Z");
  expect(renamed.blankSymbol).toBe("空");
  const machine = new TuringMachine({
    initialState: resolveInitialState(result, ""),
    blankSymbol: renamed.blankSymbol, transitions: result.transitions,
    haltStates: ["HALT"], acceptStates: [], rejectStates: [],
  }, inputToTape(renamed.input, renamed.blankSymbol));
  expect(machine.step().reason).toBe("halt");
  expect(machine.tape.entries()).toEqual([[0, "*"], [2, "Z"]]);
});

it("keeps wildcards, writes and state names distinct from a literal rename", () => {
  const project = { rules: "a,*->a,*,R\na,**->HALT,**,N\na,b->HALT,R", input: "*b", blankSymbol: "□" };
  const parsed = parseTransitions(project.rules);
  const renamed = renameProjectSymbol(project, parsed, "*", " ");
  expect(renamed.input).toBe(" b");
  expect(renamed.rules).toBe("a,*->a,*,R\na,\\s->HALT,\\s,N\na,b->HALT,R");
  expect(() => renameProjectSymbol(project, parsed, "*", "b")).toThrow("已存在");
  expect(() => renameProjectSymbol(project, parsed, "*", "XX")).toThrow("一个格子");
});
