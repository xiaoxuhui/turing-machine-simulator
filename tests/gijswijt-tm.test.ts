import { describe, expect, it } from "vitest";
import { parseTransitions, TuringMachine } from "../src/core";
import { compileGijswijtMachine, readGijswijtOutput } from "../src/gijswijt-tm";

function machineFor(threshold: number): TuringMachine {
  const project = compileGijswijtMachine(threshold);
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors).toEqual([]);
  return new TuringMachine({
    blankSymbol: project.blankSymbol, initialState: project.initialState,
    acceptStates: [], rejectStates: [], haltStates: [project.haltStates], transitions: parsed.transitions,
  }, []);
}

function run(threshold: number, limit = 60_000_000): TuringMachine {
  const machine = machineFor(threshold);
  for (let step = 0; step < limit; step += 1) {
    const result = machine.step();
    if (result.stopped) {
      expect(result.reason, `state=${machine.currentState}, head=${machine.headPosition}, read=${machine.tape.read(machine.headPosition)}`).toBe("halt");
      return machine;
    }
  }
  throw new Error(`步数超限：${machine.currentState}，已写入 ${readGijswijtOutput(machine.tape).length} 项`);
}

// Independent brute-force oracle, used only in tests (never in compilation).
function reference(length: number): number[] {
  const sequence = [1];
  while (sequence.length < length) {
    let best = 1;
    for (let size = 1; size <= sequence.length; size += 1) {
      let count = 1;
      const last = sequence.slice(-size).join(",");
      while ((count + 1) * size <= sequence.length &&
        sequence.slice(sequence.length - (count + 1) * size, sequence.length - count * size).join(",") === last) count += 1;
      best = Math.max(best, count);
    }
    sequence.push(best);
  }
  return sequence;
}

describe("Gijswijt single-tape compiler", () => {
  it.each([[0, 1], [1, 3], [2, 9], [3, 220]])("threshold %i stops at term %i", (threshold, length) => {
    const machine = run(threshold);
    expect(readGijswijtOutput(machine.tape)).toEqual(reference(length));
    expect(machine.tape.entries().every(([, text]) => /^\d+$/.test(text))).toBe(true);
    expect(machine.tape.read(machine.headPosition)).toBe(String(threshold + 1));
    console.info(`threshold=${threshold} terms=${length} steps=${machine.stepCount}`);
  }, 60_000);

  it("continues on equality, writes the seed through a transition, and uses work marks", () => {
    const machine = machineFor(2);
    expect(readGijswijtOutput(machine.tape)).toEqual([]);
    let sawMark = false, sawEqual = false;
    for (let step = 0; step < 100_000; step += 1) {
      const result = machine.step();
      sawMark ||= result.record?.writeSymbol.includes("|") ?? false;
      if (machine.currentState === "G.next" && readGijswijtOutput(machine.tape).at(-1) === 2) sawEqual = true;
      if (result.stopped) break;
    }
    expect(sawMark).toBe(true);
    expect(sawEqual).toBe(true);
    expect(readGijswijtOutput(machine.tape)).toHaveLength(9);
  });

  it("rejects invalid input before expanding rules and compiles a two-digit alphabet", () => {
    for (const input of [-1, NaN, Infinity, 1.5, 17]) expect(() => compileGijswijtMachine(input)).toThrow();
    const project = compileGijswijtMachine(10);
    expect(project.input).toBe("");
    expect(project.rules).toContain("10|");
    expect(parseTransitions(project.rules).errors).toEqual([]);
    console.info(`threshold=10 rules=${project.rules.split("\n").length - 3} bytes=${project.rules.length}`);
  });

  it("continues past 4 when the configured threshold is 4", () => {
    const machine = machineFor(4);
    for (let step = 0; step < 20_000_000; step += 1) {
      const result = machine.step();
      if (result.stopped) throw new Error(`意外停机：${result.reason} @ ${machine.currentState}`);
      if (machine.currentState === "G.next" && machine.headPosition === 221) break;
    }
    expect(machine.currentState).toBe("G.next");
    expect(readGijswijtOutput(machine.tape)).toEqual(reference(221));
    expect(machine.tape.read(219)).toBe("4");
  }, 60_000);

  it("exhaustively checks the next term for every binary prefix of length 1–6", () => {
    const definition = machineFor(3).definition;
    let checked = 0;
    for (let length = 1; length <= 6; length += 1) {
      for (let word = 0; word < 2 ** length; word += 1) {
        const prefix = Array.from({ length }, (_, i) => 1 + ((word >> i) & 1));
        let best = 1;
        for (let size = 1; size <= length; size += 1) {
          let count = 1;
          while ((count + 1) * size <= length && prefix.slice(-size).every((v, i) => v === prefix[length - (count + 1) * size + i])) count += 1;
          best = Math.max(best, count);
        }
        const machine = new TuringMachine({ ...definition, initialState: "G.end" }, [
          [-1, "#1"], ...prefix.map((value, position): [number, string] => [position, String(value)]),
        ]);
        for (let step = 0; step < 50_000; step += 1) {
          const result = machine.step();
          if (result.stopped || machine.currentState === "G.next") break;
        }
        expect(readGijswijtOutput(machine.tape), `prefix=${prefix}`).toEqual([...prefix, Math.min(4, best)]);
        checked += 1;
      }
    }
    expect(checked).toBe(126);
  });
});
