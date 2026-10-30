import { describe, expect, it } from "vitest";
import { examples, type ExampleProject } from "../src/examples";
import { inputToTape, parseTransitions, resolveInitialState, TuringMachine, type MachineDefinition, type StopReason } from "../src/core";

function run(project: ExampleProject, input = project.input, limit = 10_000): { machine: TuringMachine; reason: StopReason } {
  const parsed = parseTransitions(project.rules, { acceptStates: project.acceptStates.split(",").filter(Boolean), rejectStates: project.rejectStates.split(",").filter(Boolean), haltStates: project.haltStates.split(",").filter(Boolean) });
  expect(parsed.errors).toEqual([]);
  const definition: MachineDefinition = {
    blankSymbol: project.blankSymbol,
    initialState: resolveInitialState(parsed, project.initialState),
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
  it.each([
    ["functionBasics", "1", 1],
    ["functionComposition", "123", 3],
    ["functionParentReturn", "123", 4],
    ["functionExportEntry", "23", 2],
    ["functionExportRepeat", "1212", 4],
    ["functionMixed", "11", 6],
    ["functionMixedContinue", "123", 6],
  ] as const)("runs function tutorial %s with its advertised output and steps", (key, expected, steps) => {
    const { machine, reason } = run(examples[key]);
    expect(reason).toBe("halt");
    expect(output(machine)).toBe(expected);
    expect(machine.stepCount).toBe(steps);
  });

  it("starts from each documented public entry without a call list overriding it", () => {
    for (const [initialState, expected, steps] of [["流程", "123", 3], ["流程.第二步", "23", 2], ["流程.第三步", "3", 1]] as const) {
      const result = run({ ...examples.functionExportEntry, initialState });
      expect(result.reason).toBe("halt");
      expect(output(result.machine)).toBe(expected);
      expect(result.machine.stepCount).toBe(steps);
    }
  });

  it("applies the public extension separately for every repeat of the example", () => {
    const project = examples.functionExportRepeat;
    const definition = project.rules.slice(0, project.rules.lastIndexOf("\n\n"));
    for (let count = 1; count <= 5; count += 1) {
      const result = run({ ...project, rules: `${definition}\n\n${Array(count).fill("写一对").join("\n")}` });
      expect(result.reason).toBe("halt");
      expect(output(result.machine)).toBe("12".repeat(count));
      expect(result.machine.stepCount).toBe(2 * count);
    }
  });

  it("continues external states after function exits and exposes custom child/export usage", () => {
    const resumed = run(examples.functionReturn);
    expect(output(resumed.machine)).toBe("12");
    expect(resumed.machine.stepCount).toBe(3);
    const exported = run(examples.functionExports);
    expect(output(exported.machine)).toBe("1234");
    expect(exported.machine.stepCount).toBe(5);
  });
  it("runs the function example through its compiled entry", () => {
    const { machine, reason } = run(examples.functions);
    expect(reason).toBe("halt");
    expect(output(machine)).toBe("11111");
    expect(machine.stepCount).toBe(5);
  });
  it("verifies Goldbach by actual rule execution for every input 0–101", () => {
    const prime = (n: number) => n >= 2 && Array.from({ length: Math.max(0, n - 2) }, (_, i) => i + 2).every((d) => n % d !== 0);
    for (let n = 0; n <= 101; n += 1) {
      const result = run(examples.goldbach, "1".repeat(n), 100_000);
      const valid = n >= 4 && n <= 100 && n % 2 === 0;
      expect(result.reason, `n=${n}`).toBe(valid ? "accept" : "reject");
      if (valid) {
        const split = output(result.machine).split("+");
        expect(split).toHaveLength(2);
        expect(split.every((part) => /^1+$/.test(part) && prime(part.length))).toBe(true);
        expect(split[0].length + split[1].length).toBe(n);
      }
    }
  });

  it("matches every Collatz value for starting numbers 1–64", () => {
    const project = examples.collatz;
    const definition = { blankSymbol: project.blankSymbol, initialState: project.initialState, acceptStates: ["ACCEPT"], rejectStates: ["REJECT"], haltStates: [], transitions: parseTransitions(project.rules).transitions };
    for (let n = 1; n <= 64; n += 1) {
      const expected = [n];
      while (expected.at(-1)! !== 1) {
        const last = expected.at(-1)!;
        expected.push(last % 2 === 0 ? last / 2 : 3 * last + 1);
      }
      const machine = new TuringMachine(definition, inputToTape(n.toString(2), project.blankSymbol));
      const actual: number[] = [];
      for (let step = 0; step < 100_000; step += 1) {
        if (machine.currentState === "C.check") actual.push(parseInt(output(machine), 2));
        const result = machine.step();
        if (result.stopped) { expect(result.reason).toBe("accept"); break; }
      }
      expect(actual, `n=${n}`).toEqual(expected);
      expect(machine.currentState).toBe("ACCEPT");
      expect(output(machine)).toBe("1");
    }
    for (const invalid of ["", "0", "01"]) expect(run(project, invalid).reason).toBe("reject");
  });
  it.each([
    ["beaver3Steps", 3, 2, 21, 5],
    ["beaver3Ones", 3, 2, 14, 6],
    ["beaver4", 4, 2, 107, 13],
    ["beaver23", 2, 3, 38, 9],
    ["beaver24", 2, 4, 3_932_964, 2050],
  ] as const)("runs %s with the published state/symbol counts and result", (key, states, symbols, steps, cells) => {
    const project = examples[key];
    const result = run(project, "", steps);
    expect(result.reason).toBe("halt");
    expect(result.machine.stepCount).toBe(steps);
    expect(result.machine.tape.entries()).toHaveLength(cells);
    const transitions = parseTransitions(project.rules).transitions;
    expect(new Set(transitions.map((t) => t.fromState)).size).toBe(states);
    expect(new Set(transitions.map((t) => t.readSymbol)).size).toBe(symbols);
  }, 30_000);
  it("exhaustively multiplies unary operands 0–6 with a clean result tape", () => {
    for (let a = 0; a <= 6; a += 1) for (let b = 0; b <= 6; b += 1) {
      const result = run(examples.unaryMultiply, `${"1".repeat(a)}*${"1".repeat(b)}`);
      expect(result.reason).toBe("halt");
      expect(output(result.machine)).toBe("1".repeat(a * b));
      const positions = result.machine.tape.entries().map(([p]) => p);
      expect(positions.every((p, i) => i === 0 || p === positions[i - 1] + 1)).toBe(true);
    }
  });

  it("exhaustively compares unary operands 0–6", () => {
    for (let a = 0; a <= 6; a += 1) for (let b = 0; b <= 6; b += 1) {
      const result = run(examples.unaryCompare, `${"1".repeat(a)}?${"1".repeat(b)}`);
      expect(result.reason).toBe("halt");
      expect(output(result.machine)).toBe(a === b ? "=" : a < b ? "<" : ">");
    }
  });

  it("checks divisibility by 2 for every unary input 0–30", () => {
    for (let n = 0; n <= 30; n += 1) {
      const input = "1".repeat(n);
      const result = run(examples.unaryEven, input);
      expect(result.reason).toBe(n % 2 === 0 ? "accept" : "reject");
      expect(output(result.machine)).toBe(input);
    }
  });
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
