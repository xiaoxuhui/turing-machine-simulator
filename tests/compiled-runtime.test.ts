import { expect, it } from "vitest";
import { examples } from "../src/examples";
import { parseTransitions, resolveInitialState, TuringMachine } from "../src/core";

it.each(Object.entries(examples))("looks up every compiled transition of %s by its actual state and symbol", (_name, project) => {
  const split = (value: string) => value.split(",").map(state => state.trim()).filter(Boolean);
  const terminal = { acceptStates: split(project.acceptStates), rejectStates: split(project.rejectStates), haltStates: split(project.haltStates) };
  const parsed = parseTransitions(project.rules, terminal);
  expect(parsed.errors).toEqual([]);
  const text = parsed.transitions.map(rule => `${rule.fromState},${rule.readSymbol}->${rule.toState},${rule.writeSymbol},${rule.direction}`).join("\n");
  const actual = parseTransitions(text, terminal);
  expect(actual.errors).toEqual([]);
  expect(actual.transitions).toEqual(parsed.transitions);
  const machine = new TuringMachine({ blankSymbol: project.blankSymbol, initialState: resolveInitialState(parsed, project.initialState), ...terminal, transitions: parsed.transitions }, []);
  for (const rule of actual.transitions) {
    machine.currentState = rule.fromState;
    machine.headPosition = 0;
    machine.stepCount = 0;
    machine.tape.reset([[0, rule.readSymbol]]);
    const result = machine.step();
    expect(result.record, `${rule.fromState},${rule.readSymbol}`).toEqual({ ...rule, step: 1, headBefore: 0, headAfter: rule.direction === "R" ? 1 : rule.direction === "L" ? -1 : 0 });
    expect(machine.currentState).toBe(rule.toState);
    expect(machine.tape.read(0)).toBe(rule.writeSymbol);
  }
});
