import { expect, it } from "vitest";
import { compileRegisterMachine, type RegisterInstruction } from "../src/register-tm";
import { inputToTape, parseTransitions, TuringMachine } from "../src/core";

it("executes register transfers as plain tape rules for all pairs 0–5", () => {
  const program = new Map<string, RegisterInstruction>([
    ["loop", { kind: "dec", register: 1, positive: "add", zero: "done" }],
    ["add", { kind: "inc", register: 0, next: "loop" }],
    ["done", { kind: "halt" }],
  ]);
  const parsed = parseTransitions(compileRegisterMachine(program, "loop", 2, 0, "+"));
  expect(parsed.errors).toEqual([]);
  for (let a = 0; a <= 5; a += 1) for (let b = 0; b <= 5; b += 1) {
    const m = new TuringMachine({ blankSymbol: "□", initialState: "BOOT", acceptStates: [], rejectStates: ["REJECT"], haltStates: ["HALT"], transitions: parsed.transitions }, inputToTape(`${"1".repeat(a)}+${"1".repeat(b)}`, "□"));
    for (let step = 0; step < 100_000; step += 1) if (m.step().stopped) break;
    expect(m.currentState).toBe("HALT");
    expect(m.tape.entries().map(([, s]) => s).join("")).toBe("1".repeat(a + b));
  }
});

it("rejects invalid program references before generating rules", () => {
  expect(() => compileRegisterMachine(new Map([["x", { kind: "jump", next: "missing" }]]), "x", 2, 0, "+")).toThrow("跳转");
});
