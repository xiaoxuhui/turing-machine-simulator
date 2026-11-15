import { expect, it } from "vitest";
import { inputToTape, parseTransitions, TuringMachine } from "../src/core";
import { binaryExamples } from "../src/binary-examples";

type Operation = keyof typeof binaryExamples;
const transitions = Object.fromEntries(Object.entries(binaryExamples).map(([name, project]) => {
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors).toEqual([]);
  return [name, parsed.transitions];
}));

function run(key: Operation, input: string, expected: string): void {
  const project = binaryExamples[key];
  const machine = new TuringMachine({
    blankSymbol: project.blankSymbol, initialState: project.initialState,
    acceptStates: [], rejectStates: ["REJECT"], haltStates: ["HALT"], transitions: transitions[key],
  }, inputToTape(input, project.blankSymbol));
  for (let steps = 0; steps < 2_000_000; steps++) {
    const result = machine.step();
    if (!result.stopped) continue;
    expect(result.reason, input).toBe(expected === "REJECT" ? "reject" : "halt");
    if (expected !== "REJECT") {
      expect(machine.tape.entries(), input).toEqual([...expected].map((bit, index) => [index, bit]));
      expect(machine.headPosition, input).toBe(0);
    }
    return;
  }
  throw new Error(`${input} exceeded the tape step budget at ${machine.currentState}`);
}

it("adds, subtracts, multiplies and divides arbitrary pairs of small binary operands on tape", () => {
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) {
    const left = a.toString(2), right = b.toString(2);
    run("binaryAdd", `${left}+${right}`, (a + b).toString(2));
    run("binarySubtract", `${left}-${right}`, a >= b ? (a - b).toString(2) : "REJECT");
    run("binaryMultiply", `${left}*${right}`, (a * b).toString(2));
    run("binaryDivide", `${left}/${right}`, b ? Math.floor(a / b).toString(2) : "REJECT");
  }
});

it("counts integer divisions for every supported base and rounds the logarithm down", () => {
  for (let base = 0; base <= 5; base++) for (let x = 0; x <= 18; x++) {
    let exponent = 0;
    if (base >= 2 && x >= 1) while (base ** (exponent + 1) <= x) exponent++;
    run("binaryLog", `${base.toString(2)}@${x.toString(2)}`, base >= 2 && x >= 1 ? exponent.toString(2) : "REJECT");
  }
});

it("uses the exponent bits for square-and-multiply, including exponent zero", () => {
  for (let base = 0; base <= 4; base++) for (let exponent = 0; exponent <= 4; exponent++) {
    run("binaryPower", `${base.toString(2)}^${exponent.toString(2)}`, (base ** exponent).toString(2));
  }
});

it("accepts leading zeroes and rejects malformed operands", () => {
  run("binaryAdd", "00101+00011", "1000");
  run("binarySubtract", "0001-100", "REJECT");
  run("binaryDivide", "0001101/00011", "100");
  run("binaryLog", "00011@00011011", "11");
  for (const input of ["", "+11", "01+", "01++10", "0110", "2+10", "10-1"]) run("binaryAdd", input, "REJECT");
});
