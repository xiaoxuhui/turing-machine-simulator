import originalSource from "./fixtures/fibonacci-original.tm?raw";
import { expect, it } from "vitest";
import { examples } from "../src/examples";
import { exampleSource } from "../src/example-source";
import { parseTransitions, TuringMachine, type MachineDefinition } from "../src/core";
import { fibonacciSourceVariant } from "../src/fibonacci-example";
import { resolveInitialState } from "../src/core";

it.each(["descriptive", "numeric"] as const)("preserves each tape step with %s names and optional functions", naming => {
  for (const structure of ["flat", "functions"] as const) for (const style of ["plain", "commented"] as const) {
    const project = fibonacciSourceVariant(naming, structure);
    const parsed = parseTransitions(exampleSource(project, style), { haltStates: project.haltStates ? [project.haltStates] : [], acceptStates: [], rejectStates: [] });
    expect(parsed.errors).toEqual([]);
    expect(parsed.transitions).toHaveLength(54);
    const a = new TuringMachine({ blankSymbol: "0", initialState: "0.0", haltStates: [], acceptStates: [], rejectStates: [], transitions: original.transitions }, []);
    const b = new TuringMachine({ blankSymbol: "0", initialState: resolveInitialState(parsed, project.initialState), haltStates: project.haltStates ? [project.haltStates] : [], acceptStates: [], rejectStates: [], transitions: parsed.transitions }, []);
    for (let step = 0; step < 10000; step++) {
      const x = a.step(), y = b.step();
      if (x.stopped || y.stopped || a.headPosition !== b.headPosition || x.record?.readSymbol !== y.record?.readSymbol || x.record?.writeSymbol !== y.record?.writeSymbol || x.record?.direction !== y.record?.direction) throw new Error(`${naming}/${structure}/${style} differs at ${step}`);
    }
    expect(b.tape.entries()).toEqual(a.tape.entries());
    expect(style === "commented" || !/^\s*#/m.test(exampleSource(project, style))).toBe(true);
  }
});

it("restores the exact original numeric flat rule source", () => {
  expect(exampleSource(fibonacciSourceVariant("numeric", "flat"), "plain").trim()).toBe(originalSource.trim());
});

const original = parseTransitions(originalSource);
const renamed = parseTransitions(examples.fibonacci.rules);
const names = new Map(original.transitions.map((rule, index) => [rule.fromState, renamed.transitions[index].fromState]));
const definition = (initialState: string, transitions: MachineDefinition["transitions"]): MachineDefinition => ({
  initialState, transitions, blankSymbol: "0", acceptStates: [], rejectStates: [], haltStates: [],
});

it("only renames the states of the user's 54-rule machine with a bijection", () => {
  expect(original.errors).toEqual([]);
  expect(renamed.errors).toEqual([]);
  expect(renamed.transitions).toHaveLength(54);
  expect(new Set(names.values()).size).toBe(names.size);
  expect(renamed.transitions).toEqual(original.transitions.map(rule => ({
    ...rule, fromState: names.get(rule.fromState), toState: names.get(rule.toState),
  })));
  expect(examples.fibonacci).toMatchObject({ initialState: names.get("0.0"), input: "", blankSymbol: "0", maxSteps: null, acceptStates: "", rejectStates: "", haltStates: "" });
  expect([...names.values()].every(name => /^fib\.[A-Za-z]+$/.test(name))).toBe(true);
});

it("executes one million matching steps and leaves the expected completed Fibonacci terms", () => {
  const a = new TuringMachine(definition("0.0", original.transitions), []);
  const b = new TuringMachine(definition(examples.fibonacci.initialState, renamed.transitions), []);
  for (let step = 0; step < 1_000_000; step++) {
    const x = a.step(), y = b.step();
    if (x.stopped || y.stopped || names.get(a.currentState) !== b.currentState || a.headPosition !== b.headPosition || x.record?.writeSymbol !== y.record?.writeSymbol || x.record?.readSymbol !== y.record?.readSymbol || x.record?.direction !== y.record?.direction) {
      throw new Error(`Original and renamed machines differ or stop at step ${step + 1}`);
    }
  }
  expect(b.tape.entries()).toEqual(a.tape.entries());
  const entries = b.tape.entries(), last = entries.at(-1)![0];
  const tape = Array.from({ length: last + 1 }, (_, i) => b.tape.read(i)).join("");
  const completed = tape.split("0").filter(part => /^1+$/.test(part)).map(part => part.length);
  expect(completed).toEqual([1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233]);
  expect(b.stepCount).toBe(1_000_000);
}, 15000);

it("explains marking, copying and the next round between rules only in commented mode", () => {
  const commented = exampleSource(examples.fibonacci, "commented");
  const plain = exampleSource(examples.fibonacci, "plain");
  expect(plain).not.toMatch(/^\s*#/m);
  const lines = commented.split("\n"), firstRule = lines.findIndex(line => line.includes("->"));
  expect(lines.slice(firstRule + 1).filter(line => line.startsWith("#")).length).toBeGreaterThanOrEqual(8);
  expect(commented).toContain("下一轮");
  expect(parseTransitions(commented).transitions).toEqual(parseTransitions(plain).transitions);
});
