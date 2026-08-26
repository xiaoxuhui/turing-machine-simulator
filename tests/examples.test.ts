import { describe, expect, it } from "vitest";
import { examples, type ExampleProject } from "../src/examples";
import { inputToTape, parseTransitions, TuringMachine, type MachineDefinition, type StopReason } from "../src/core";

function run(project: ExampleProject, input = project.input): { machine: TuringMachine; reason: StopReason } {
  const definition: MachineDefinition = {
    blankSymbol: project.blankSymbol,
    initialState: project.initialState,
    acceptStates: project.acceptStates.split(",").filter(Boolean),
    rejectStates: project.rejectStates.split(",").filter(Boolean),
    haltStates: project.haltStates.split(",").filter(Boolean),
    transitions: parseTransitions(project.rules).transitions,
  };
  const machine = new TuringMachine(definition, inputToTape(input, project.blankSymbol));
  for (let guard = 0; guard < 10_000; guard += 1) {
    const result = machine.step();
    if (result.stopped) return { machine, reason: result.reason! };
  }
  throw new Error("示例未在 10,000 步内停止");
}

describe("built-in examples", () => {
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
