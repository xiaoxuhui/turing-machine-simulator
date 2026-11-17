import { expect, it } from "vitest";
import { inputToTape, parseTransitions, TuringMachine } from "../src/core";
import { makeUniversalProject, readUniversalAlphabet, readUniversalResult, splitUniversalSource } from "../src/universal-machine";
import { visibleTapeSymbol } from "../src/symbol-annotations";

function run(source: string, budget: number) {
  const { project, alphabet } = makeUniversalProject(source, "□", budget);
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors).toEqual([]);
  expect(readUniversalAlphabet(project.rules)).toEqual(alphabet);
  const machine = new TuringMachine({
    ...project, acceptStates: [], rejectStates: [project.rejectStates],
    haltStates: [project.haltStates], transitions: parsed.transitions,
  }, inputToTape(project.input, project.blankSymbol));
  for (let i = 0; i < 2_000_000; i++) {
    const step = machine.step();
    if (!step.stopped) continue;
    expect(step.reason, machine.currentState).toBe("halt");
    return { result: readUniversalResult(machine.tape, alphabet), actualSteps: machine.stepCount, rules: project.rules.split("\n").slice(1).join("\n") };
  }
  throw new Error("Universal interpreter did not finish at " + machine.currentState);
}

it("keeps slashes and colons literal after the rule table", () => {
  expect(splitUniversalSource("q0,/->q1,\\,R/q1,□->HALT,1,N:/\\:x")).toEqual({
    rules: "q0,/->q1,\\,R\nq1,□->HALT,1,N", input: "/\\:x",
  });
  expect(splitUniversalSource("q0,/->q1,\\,R\\q1,□->HALT,1,N:/")).toMatchObject({ input: "/" });
});

it("uses the same tape interpreter for different programs and walks both directions", () => {
  const a = run("q0,/->q1,\\,R/q1,□->HALT,1,N:/,q0,HALT,,", 3);
  expect(a.result).toEqual({ reason: "H", steps: 2, state: "HALT", read: "1", output: "\\1" });
  const b = run("q0,1->left,1,L/left,□->right,x,R/right,1->HALT,y,N:1,q0,HALT,,", 3);
  expect(b.result).toEqual({ reason: "H", steps: 3, state: "HALT", read: "y", output: "xy" });
  expect(b.rules).toBe(a.rules);
  const parsed = parseTransitions(b.rules);
  const symbols = new Set(parsed.transitions.map(rule => rule.writeSymbol));
  for (const symbol of ["#(L)1", "#(R)1", "#(I)1"]) {
    expect(symbols.has(symbol)).toBe(true);
    expect(visibleTapeSymbol(symbol)).toBe("1");
  }
  expect(parsed.transitions.some(rule => /^U\.\d+\.s$/.test(rule.fromState))).toBe(true);
});

it("preserves raw input and distinguishes missing rules from the simulated step limit", () => {
  expect(run("q0,1->HALT,0,N:/\\:a,q0,HALT,,", 2).result).toMatchObject({ reason: "M", steps: 0, output: "/\\:a" });
  expect(run("q0,1->q0,1,R:11,q0,,,", 1).result).toMatchObject({ reason: "B", steps: 1, output: "11" });
  expect(run("q0,*->HALT,*,N:/,q0,HALT,,", 1).result).toMatchObject({ reason: "H", steps: 1, output: "/" });
});

it("takes terminal settings from the source and keeps commas on the initial tape", () => {
  const rule = "start,*->OK,*,N";
  expect(run(rule + ":a,/,start,,OK,NO", 1).result).toMatchObject({ reason: "A", output: "a,/" });
  expect(run(rule + ":a,/,start,,,OK", 1).result).toMatchObject({ reason: "J", output: "a,/" });
  expect(run(rule + ":a,/,OK,OK,OK,OK", 0).result).toMatchObject({ reason: "A", steps: 0 });
});
