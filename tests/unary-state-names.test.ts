import { expect, it } from "vitest";
import { examples, type ExampleProject } from "../src/examples";
import { unaryExamples } from "../src/unary-examples";
import { hyperoperationExamples } from "../src/hyperoperation-examples";
import { inverseOperationExamples } from "../src/inverse-operation-examples";
import { inputToTape, parseTransitions, resolveInitialState, TuringMachine } from "../src/core";

function compile(project: ExampleProject, source = project.rules) {
  const options = {
    haltStates: project.haltStates.split(",").filter(Boolean),
    acceptStates: project.acceptStates.split(",").filter(Boolean),
    rejectStates: project.rejectStates.split(",").filter(Boolean),
  };
  const parsed = parseTransitions(source, options);
  expect(parsed.errors).toEqual([]);
  return new TuringMachine({ ...options, blankSymbol: project.blankSymbol,
    initialState: resolveInitialState(parsed, project.initialState), transitions: parsed.transitions,
  }, inputToTape(project.input, project.blankSymbol));
}

it.each(Object.entries({ ...unaryExamples, ...hyperoperationExamples, ...inverseOperationExamples }))(
  "preserves every tape step of %s after shortening its states", (id, original) => {
    const compact = examples[id];
    const a = compile(original), b = compile(compact);
    const symbol = (value: string | undefined) => value === original.blankSymbol ? compact.blankSymbol : value;
    const stateNames = new Map<string, string>();
    let stopped = false;
    for (let step = 0; step < 200_000; step++) {
      const previous = stateNames.get(a.currentState);
      if (previous !== undefined && previous !== b.currentState) throw new Error(`Inconsistent state mapping at ${step}`);
      stateNames.set(a.currentState, b.currentState);
      const x = a.step(), y = b.step();
      if (x.stopped !== y.stopped || x.reason !== y.reason || a.headPosition !== b.headPosition ||
        symbol(x.record?.writeSymbol) !== y.record?.writeSymbol || symbol(x.record?.readSymbol) !== y.record?.readSymbol ||
        x.record?.direction !== y.record?.direction) throw new Error(`Changed tape behavior at ${step}`);
      if (x.stopped) { stopped = true; break; }
    }
    expect(stopped).toBe(true);
    expect(new Set(stateNames.values()).size).toBe(stateNames.size);
    expect(b.tape.entries()).toEqual(a.tape.entries());
    expect(compact.blankSymbol).toBe("_");
    expect([compact.haltStates, compact.acceptStates, compact.rejectStates].join(",")).not.toMatch(/HALT|ACCEPT|REJECT/);
    expect(/(?:□|\b(?:HALT|ACCEPT|REJECT)\b)/.test(compact.rules)).toBe(false);
    expect(compact.rules).not.toMatch(/(?:sub\.return|mul\.pickA|parse\.scanA|carryBar)/);
  },
);

it("uses short names in reusable routines and their calls", () => {
  const project = examples.unaryDivide;
  const ordinary = compile(project), functions = compile(project, project.sharedRules!());
  expect(project.sharedRules!()).toContain("inc(s,e):");
  expect(project.sharedRules!()).not.toMatch(/carryBar|parse\.scanA|return\.\d/);
  let stopped = false;
  for (let step = 0; step < 10_000; step++) {
    const x = ordinary.step(), y = functions.step();
    expect(y.stopped).toBe(x.stopped);
    expect(y.reason).toBe(x.reason);
    expect(functions.headPosition).toBe(ordinary.headPosition);
    if (x.stopped) { stopped = true; break; }
  }
  expect(stopped).toBe(true);
  expect(functions.tape.entries()).toEqual(ordinary.tape.entries());
});

it.each([
  ["unary", "111", "H", "halt"],
  ["unaryEven", "1111", "A", "accept"],
  ["unaryEven", "111", "R", "reject"],
  ["unarySubtract", "1-11", "R", "reject"],
  ["unaryDivide", "11/", "R", "reject"],
] as const)("uses the short terminal of %s with input %s", (id, input, terminal, reason) => {
  const machine = compile({ ...examples[id], input });
  let result;
  for (let step = 0; step < 10_000; step++) {
    result = machine.step();
    if (result.stopped) break;
  }
  expect(result?.reason).toBe(reason);
  expect(machine.currentState).toBe(terminal);
});
