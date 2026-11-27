import { expect, it } from "vitest";
import { parseTransitions, TuringMachine } from "../src/core";
import { makeDecimalFibonacci } from "../src/fibonacci-decimal";
import { readDecimalSequenceOutput } from "../src/decimal-sequence-output";

const project = makeDecimalFibonacci();
const parsed = parseTransitions(project.rules);
const definition = { blankSymbol: project.blankSymbol, initialState: project.initialState, haltStates: [], acceptStates: [], rejectStates: [], transitions: parsed.transitions };

it("generates 100 exact decimal Fibonacci terms through ordinary transitions without a stopping ceiling", () => {
  expect(parsed.errors).toEqual([]);
  expect(project.haltStates).toBe("");
  expect(project.maxSteps).toBeNull();
  const machine = new TuringMachine(definition, []);
  for (let step = 0; step < 1_000_000; step++) {
    expect(machine.step().stopped).toBe(false);
    if (machine.currentState === "F.next" && readDecimalSequenceOutput(machine.tape).length === 100) break;
  }
  const expected = [0n, 1n];
  while (expected.length < 100) expected.push(expected.at(-1)! + expected.at(-2)!);
  expect(readDecimalSequenceOutput(machine.tape)).toEqual(expected.map(String));
  expect(machine.tape.entries().every(([, text]) => /^[0-9|]$/.test(text))).toBe(true);
});

it.each([["0", "0"], ["0", "9"], ["8", "13"], ["99", "1"], ["999", "999"], ["99999999999999999999999999", "1"]])(
  "preserves both sources while adding decimal %s + %s", (a, b) => {
    const text = `|${a}|${b}`;
    const machine = new TuringMachine({ ...definition, initialState: "F.next" }, [...text].map((char, i) => [i, char]), text.length);
    for (let step = 0; step < 100_000; step++) {
      const result = machine.step();
      if (result.stopped) throw new Error(`缺少规则 ${machine.currentState},${machine.tape.read(machine.headPosition)}`);
      if (machine.currentState === "F.next") break;
    }
    expect(readDecimalSequenceOutput(machine.tape)).toEqual([a, b, String(BigInt(a) + BigInt(b))]);
    expect(machine.tape.entries().map(([, char]) => char).join("")).toBe(`${text}|${BigInt(a) + BigInt(b)}`);
  },
);
