import { expect, it } from "vitest";
import { lambdaNameAlphabet, parseLambdaTerm, reduceLambda } from "../src/lambda-reduce";
import { makeLambdaProject, readLambdaOutput } from "../src/lambda-local";
import { inputToTape, parseTransitions, TuringMachine } from "../src/core";

it("lists every supported name character", () => {
  expect(lambdaNameAlphabet).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_0123456789.");
  for (const char of lambdaNameAlphabet) expect(parseLambdaTerm(char)).toEqual({ kind: "free", name: char });
});

it.each([
  ["(λx.x) A.B_0123456789", "A.B_0123456789"],
  ["(λA.B . A.B) Z_09", "Z_09"],
  ["(λ. . .) A..B", "A..B"],
  ["(λx.λA.B . x) A.B", "λA.B0 . A.B"],
  ["(λx.x) .", "."],
] as const)("reduces dotted names in %s", (source, expected) => {
  expect(reduceLambda(source)).toMatchObject({ status: "done", output: expected });
  const project = makeLambdaProject(source);
  const terminal = { haltStates: project.haltStates.split(","), acceptStates: [project.acceptStates], rejectStates: [project.rejectStates] };
  const parsed = parseTransitions(project.rules, terminal);
  expect(parsed.errors).toEqual([]);
  const machine = new TuringMachine({ ...terminal, blankSymbol: project.blankSymbol, initialState: project.initialState, transitions: parsed.transitions }, inputToTape(project.input, project.blankSymbol));
  let stopped = false;
  for (let i = 0; i < 300_000; i++) {
    const result = machine.step();
    if (!result.stopped) continue;
    expect(result.reason).toBe("accept"); stopped = true; break;
  }
  expect(stopped).toBe(true);
  expect(readLambdaOutput(machine.tape)?.output).toBe(expected);
}, 30_000);

it("compiles the whole alphabet even if the input only uses A", () => {
  const rules = makeLambdaProject("A").rules;
  for (const char of lambdaNameAlphabet) {
    expect(rules).toContain(char + "#(λ.char)");
    expect(rules).toContain(char + "#(λ.free.first)");
    expect(rules).toContain(char + "#(λ.bound.first)");
  }
});
