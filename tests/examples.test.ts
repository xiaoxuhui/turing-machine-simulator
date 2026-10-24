import { describe, expect, it } from "vitest";
import { examples, type ExampleProject } from "../src/examples";
import { inputToTape, parseTransitions, TuringMachine, type MachineDefinition, type StopReason } from "../src/core";

function run(project: ExampleProject, input = project.input, limit = 10_000): { machine: TuringMachine; reason: StopReason } {
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors).toEqual([]);
  const definition: MachineDefinition = {
    blankSymbol: project.blankSymbol,
    initialState: project.initialState,
    acceptStates: project.acceptStates.split(",").filter(Boolean),
    rejectStates: project.rejectStates.split(",").filter(Boolean),
    haltStates: project.haltStates.split(",").filter(Boolean),
    transitions: parsed.transitions,
  };
  const machine = new TuringMachine(definition, inputToTape(input, project.blankSymbol));
  for (let guard = 0; guard < limit; guard += 1) {
    const result = machine.step();
    if (result.stopped) return { machine, reason: result.reason! };
  }
  throw new Error(`示例 ${project.name} 未在 ${limit} 步内停止`);
}

const output = (machine: TuringMachine) => machine.tape.entries().map(([, symbol]) => symbol).join("");

describe("built-in examples", () => {
  it("exhaustively adds all unary operands 0–6", () => {
    for (let a = 0; a <= 6; a += 1) for (let b = 0; b <= 6; b += 1) {
      const result = run(examples.unaryAdd, `${"1".repeat(a)}+${"1".repeat(b)}`);
      expect(result.reason).toBe("halt");
      expect(output(result.machine)).toBe("1".repeat(a + b));
    }
  });

  it("exhaustively subtracts unary operands 0–6 and rejects negative results", () => {
    for (let a = 0; a <= 6; a += 1) for (let b = 0; b <= 6; b += 1) {
      const result = run(examples.unarySubtract, `${"1".repeat(a)}-${"1".repeat(b)}`);
      expect(result.reason).toBe(a < b ? "reject" : "halt");
      if (a >= b) expect(output(result.machine)).toBe("1".repeat(a - b));
    }
  });
  it("increments unary and binary inputs", () => {
    const unary = run(examples.unary);
    expect(unary.machine.tape.entries().map(([, symbol]) => symbol).join("")).toBe("1111");
    const binary = run(examples.binary, "1011");
    expect(binary.machine.tape.entries().map(([, symbol]) => symbol).join("")).toBe("1100");
  });

  it("accepts a palindrome and rejects a non-palindrome", () => {
    expect(run(examples.palindrome, "1001").reason).toBe("accept");
    expect(run(examples.palindrome, "1011").reason).toBe("reject");
  });

  it("runs the two-state busy beaver for six steps and writes four ones", () => {
    const result = run(examples.beaver);
    expect(result.machine.stepCount).toBe(6);
    expect(result.machine.tape.entries().filter(([, symbol]) => symbol === "1")).toHaveLength(4);
  });
});
