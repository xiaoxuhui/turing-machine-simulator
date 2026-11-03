import { expect, it } from "vitest";
import { registerAdderExample as project } from "../src/register-adder-example";
import { inputToTape, parseTransitions, resolveInitialState, TuringMachine } from "../src/core";
import originalSource from "../src/register-adder.tm?raw";

function run(input: string) {
  const parsed = parseTransitions(project.rules, { haltStates: ["HALT"], acceptStates: [], rejectStates: [] });
  expect(parsed.errors).toEqual([]);
  const machine = new TuringMachine({ blankSymbol: "0", initialState: resolveInitialState(parsed, "go"), haltStates: ["HALT"], acceptStates: [], rejectStates: [], transitions: parsed.transitions }, inputToTape(input, "0"));
  let result;
  for (let guard = 0; guard < 100_000; guard++) { result = machine.step(); if (result.stopped) break; }
  return { output: machine.tape.entries().map(([, symbol]) => symbol).join(""), steps: machine.stepCount, reason: result?.reason, parsed };
}

it("preserves the user's complete original source, including explicit left movement", () => {
  expect(project.rules).toBe(originalSource.trimEnd());
  expect(project.rules).toContain("2,1->3,1,L");
  expect(run(project.input)).toMatchObject({ output: "111", steps: 146, reason: "halt" });
  const parsed = run("11+").parsed;
  expect(parsed.transitions).toContainEqual({ fromState: "2", readSymbol: "1", toState: "3", writeSymbol: "1", direction: "L" });
});

it("verifies addition for the original routine's tested zero and one left operands", () => {
  for (let m = 0; m <= 1; m++) for (let n = 0; n <= 8; n++) {
    const result = run("1".repeat(m) + "+" + "1".repeat(n));
    expect(result.reason).toBe("halt");
    expect(result.output).toBe("1".repeat(m + n));
  }
});

it("records the original 2+0 result without silently replacing the user's L", () => {
  expect(run("11+")).toMatchObject({ output: "1", steps: 109, reason: "halt" });
});
