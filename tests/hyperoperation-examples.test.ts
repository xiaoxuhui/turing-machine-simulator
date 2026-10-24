import { describe, expect, it } from "vitest";
import { inputToTape, parseTransitions, TuringMachine } from "../src/core";
import { hyperoperationExamples } from "../src/hyperoperation-examples";

const parsed = Object.fromEntries(Object.entries(hyperoperationExamples).map(([key, example]) => [key, parseTransitions(example.rules)]));

function run(key: string, input: string, answer: number | "reject"): number {
  const example = hyperoperationExamples[key];
  const machine = new TuringMachine({
    blankSymbol: example.blankSymbol, initialState: example.initialState,
    acceptStates: [], rejectStates: ["REJECT"], haltStates: ["HALT"], transitions: parsed[key].transitions,
  }, inputToTape(input, example.blankSymbol));
  let steps = 0;
  for (; steps < 10_000_000; steps += 1) if (machine.step().stopped) break;
  expect(machine.currentState, `${key}: ${input}, ${steps} steps`).toBe(answer === "reject" ? "REJECT" : "HALT");
  if (answer !== "reject") {
    const entries = machine.tape.entries();
    expect(entries.map(([, symbol]) => symbol).join(""), input).toBe("1".repeat(answer));
    expect(entries.every(([position], index) => position === entries[0][0] + index)).toBe(true);
  }
  return steps + 1;
}
const unary = (n: number) => "1".repeat(n);

describe("higher arithmetic executed only by ordinary tape transitions", () => {
  it("compiles unambiguous rules and uses Max without setting speed", () => {
    for (const [key, example] of Object.entries(hyperoperationExamples)) {
      expect(parsed[key].errors).toEqual([]);
      expect(example.maxSteps).toBeNull();
      expect(example).not.toHaveProperty("speed");
    }
  });
  it("divides every numerator 0–8 by every divisor 0–4", () => {
    for (let a = 0; a <= 8; a += 1) for (let b = 0; b <= 4; b += 1) {
      run("unaryDivide", `${unary(a)}/${unary(b)}`, b === 0 ? "reject" : Math.floor(a / b));
    }
  });
  it("raises bases 0–3 to exponents 0–3, including zero conventions", () => {
    for (let a = 0; a <= 3; a += 1) for (let b = 0; b <= 3; b += 1) {
      run("unaryPower", `${unary(a)}^${unary(b)}`, a ** b);
    }
  });
  it("tetrates right-associated towers and handles height zero", () => {
    for (let height = 0; height <= 5; height += 1) run("unaryTetration", `1^^${unary(height)}`, 1);
    for (const [base, height, answer] of [[2, 0, 1], [2, 1, 2], [2, 2, 4], [2, 3, 16], [3, 1, 3], [3, 2, 27]]) {
      run("unaryTetration", `${unary(base)}^^${unary(height)}`, answer);
    }
    run("unaryTetration", "^^11", "reject");
  });
  it("pentates small values and handles count zero", () => {
    for (let count = 0; count <= 4; count += 1) run("unaryPentation", `1^^^${unary(count)}`, 1);
    for (const [base, count, answer] of [[2, 0, 1], [2, 1, 2], [2, 2, 4], [3, 1, 3]]) {
      run("unaryPentation", `${unary(base)}^^^${unary(count)}`, answer);
    }
    run("unaryPentation", "^^^", "reject");
  });
  it("rejects malformed input instead of silently computing another operation", () => {
    for (const [key, inputs] of [
      ["unaryDivide", ["111", "1//1", "0/1", "1+1"]],
      ["unaryPower", ["1^^1", "1^1^1", "1^0"]],
      ["unaryTetration", ["1^1", "1^^^1"]],
      ["unaryPentation", ["1^^1", "1^^^^1"]],
    ] as const) for (const input of inputs) run(key, input, "reject");
  });
  it("finishes all four default inputs with clean unary answers", () => {
    for (const [key, answer] of [["unaryDivide", 3], ["unaryPower", 9], ["unaryTetration", 4], ["unaryPentation", 4]] as const) {
      const steps = run(key, hyperoperationExamples[key].input, answer);
      console.info(`${key}: ${steps} tape steps; ${parsed[key].transitions.length} rules`);
    }
  });
});
