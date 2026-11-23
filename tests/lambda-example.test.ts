import { expect, it } from "vitest";
import { inputToTape, parseTransitions, TuringMachine } from "../src/core";
import { examples } from "../src/examples";
import { reduceLambda } from "../src/lambda-reduce";
import { lambdaBeta, makeLambdaProject, readLambdaOutput } from "../src/lambda-local";

const project = examples.lambda;
const reduced = new WeakSet<TuringMachine>();
function machineFor(input: string): TuringMachine {
  const project = makeLambdaProject(input);
  const terminals = { acceptStates: [project.acceptStates], rejectStates: [project.rejectStates], haltStates: project.haltStates.split(",") };
  const parsed = parseTransitions(project.rules, terminals);
  expect(parsed.errors).toEqual([]);
  return new TuringMachine({
    initialState: project.initialState,
    blankSymbol: project.blankSymbol,
    transitions: parsed.transitions,
    ...terminals,
  }, inputToTape(project.input, project.blankSymbol));
}

function finish(machine: TuringMachine) {
  for (let step = 0; step < 1_000_000; step++) {
    const result = machine.step();
    if (result.record?.fromState === lambdaBeta) reduced.add(machine);
    if (result.stopped) return result.reason;
  }
  throw new Error(`未在步数内停机：${machine.currentState}，位置 ${machine.headPosition}`);
}

it.each([
  ["(λx.λy.x) y", "λy0.y"],
  ["(\\x.x) a", "a"],
  ["λx. (λy.y) x", "λx.x"],
  ["λx.(λx.x) x", "λx.x"],
  ["λz.(λx.λy.x) z", "λz.λy.z"],
  ["(λx.λy.y) x", "λy.y"],
  ["(λx.x x) (λy.y)", "λy.y"],
  ["(λx.a) ((λx.x x) (λx.x x))", "a"],
  ["ab c", "ab c"],
  ["  ( λ x .  x )  a  ", "a"],
  ["\u3000(λ\u00a0x\t.\u3000x)\u00a0a\u3000", "a"],
  ["(λV0.(λV00.V0))", "(λV0.(λV00.V0))"],
])("reduces %s to %s in both modes", (input, expected) => {
  const machine = machineFor(input);
  expect(finish(machine), `${machine.currentState} after ${machine.stepCount} steps`).toBe("accept");
  const decoded = readLambdaOutput(machine.tape);
  expect(reduced.has(machine) ? decoded?.output : decoded?.literal).toBe(expected);
  expect(machine.headPosition).toBe(0);
  expect(reduceLambda(input)).toMatchObject({ status: "done", output: expected });
});

it.each(["", "\u3000 \u00a0\t", "λx.", "λx x", "(x", "x)", "()", "x+z", "λV 0.x"])("rejects malformed input %s", input => {
  expect(() => makeLambdaProject(input)).toThrow();
  expect(reduceLambda(input).status).toBe("invalid");
});

it("reports the direct calculation limit without calling a partial term a normal form", () => {
  expect(reduceLambda("(λx.x x) (λx.x x)", 3)).toMatchObject({ status: "limited", steps: 3 });
  expect(reduceLambda("(λx.x)a", 1)).toEqual({ status: "done", output: "a", steps: 1 });
});

it("shows one beta reduction at a time and continues from the displayed term", () => {
  const input = "(λx.x)((λy.y)a)";
  const first = reduceLambda(input, undefined, { singleStep: true });
  expect(first).toEqual({ status: "stepped", output: "(λy.y) a", steps: 1 });
  if (!("output" in first)) throw new Error(first.message);
  expect(reduceLambda(first.output, undefined, { singleStep: true, continuation: true }))
    .toEqual({ status: "done", output: "a", steps: 1 });
  expect(reduceLambda("a", undefined, { singleStep: true })).toEqual({ status: "done", output: "a", steps: 0 });
});

it("counts a beta reduction even when the expression repeats", () => {
  const result = reduceLambda("(λx.x x) (λx.x x)", undefined, { singleStep: true });
  expect(result).toMatchObject({ status: "stepped", steps: 1 });
});

it("keeps applying beta reduction to an expression with no normal form", () => {
  const machine = machineFor("(λx.x x) (λx.x x)");
  for (let step = 0; step < 30_000; step++) {
    expect(machine.step().stopped).toBe(false);
  }
});

it("runs the catalog lambda example with its encoded initial tape", () => {
  const machine = machineFor(project.lambdaSource!.source);
  expect(finish(machine)).toBe("accept");
  expect(readLambdaOutput(machine.tape)?.output).toBe("λy0.y");
});
