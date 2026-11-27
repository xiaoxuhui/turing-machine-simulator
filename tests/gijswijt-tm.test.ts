import { describe, expect, it } from "vitest";
import { parseTransitions, Tape, TuringMachine } from "../src/core";
import { visibleTapeSymbol } from "../src/symbol-annotations";
import { compileGijswijtMachine, readGijswijtDecimalOutput, readGijswijtOutput } from "../src/gijswijt-tm";

function machineFor(threshold: number | null): TuringMachine {
  const project = compileGijswijtMachine(threshold);
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors).toEqual([]);
  return new TuringMachine({
    blankSymbol: project.blankSymbol, initialState: project.initialState,
    acceptStates: [], rejectStates: [], haltStates: project.haltStates ? [project.haltStates] : [], transitions: parsed.transitions,
  }, []);
}

function run(threshold: number, limit = 120_000_000): TuringMachine {
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
    expect(machine.tape.entries().every(([, text]) => /^[\d|]$/.test(text))).toBe(true);
    expect(machine.tape.entries().map(([, text]) => text).join("")).toBe(reference(length).map(term => `|${term}`).join(""));
    console.info(`threshold=${threshold} terms=${length} steps=${machine.stepCount}`);
  }, 60_000);

  it("continues on equality, writes the seed through a transition, and uses work marks", () => {
    const machine = machineFor(2);
    expect(readGijswijtOutput(machine.tape)).toEqual([]);
    let sawMark = false, sawEqual = false;
    for (let step = 0; step < 100_000; step += 1) {
      const result = machine.step();
      sawMark ||= result.record?.writeSymbol.includes("#(") ?? false;
      if (machine.currentState === "G.next" && readGijswijtOutput(machine.tape).at(-1) === 2) sawEqual = true;
      if (result.stopped) break;
    }
    expect(sawMark).toBe(true);
    expect(sawEqual).toBe(true);
    expect(readGijswijtOutput(machine.tape)).toHaveLength(9);
  });

  it("rejects invalid thresholds and uses ten digit symbols rather than one symbol per integer", () => {
    for (const input of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => compileGijswijtMachine(input)).toThrow();
    const project = compileGijswijtMachine(12345);
    expect(project.input).toBe("");
    const parsed = parseTransitions(project.rules);
    expect(parsed.errors).toEqual([]);
    const alphabet = new Set(parsed.transitions.flatMap(rule => [rule.readSymbol, rule.writeSymbol]).map(visibleTapeSymbol));
    expect([...alphabet].sort()).toEqual([..."0123456789|@□"].sort());
    expect(project.blankSymbol).toBe("□");
  });

  it("continues past 4 when the configured threshold is 4", () => {
    const machine = machineFor(4);
    for (let step = 0; step < 120_000_000; step += 1) {
      const result = machine.step();
      if (result.stopped) throw new Error(`意外停机：${result.reason} @ ${machine.currentState}`);
      if (machine.currentState === "G.next" && readGijswijtOutput(machine.tape).length === 221) break;
    }
    expect(machine.currentState).toBe("G.next");
    expect(readGijswijtOutput(machine.tape)).toEqual(reference(221));
    expect(machine.tape.read(439)).toBe("4");
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
        const machine = prefixMachine(definition, prefix);
        for (let step = 0; step < 50_000; step += 1) {
          const result = machine.step();
          if (result.stopped || machine.currentState === "G.next") break;
        }
        expect(readGijswijtOutput(machine.tape), `prefix=${prefix}`).toEqual([...prefix, best]);
        checked += 1;
      }
    }
    expect(checked).toBe(126);
  });

  it("runs without a numeric ceiling and can continue beyond the finite stopping point", () => {
    const machine = machineFor(null);
    expect(machine.definition.haltStates).toEqual([]);
    for (let step = 0; step < 100_000; step++) {
      expect(machine.step().stopped).toBe(false);
      if (machine.currentState === "G.next" && readGijswijtOutput(machine.tape).length === 20) break;
    }
    expect(readGijswijtOutput(machine.tape)).toEqual(reference(20));
  });

  it.each([
    [Array(10).fill(1), 10],
    [Array(12).fill(12), 12],
    [[12, 3, 12, 3], 2],
    [[1, 23, 12, 3], 1],
    [[10, 10, 0, 0], 2],
  ] as [number[], number][])("compares complete decimal terms and appends %s → %i", (prefix, expected) => {
    const machine = prefixMachine(machineFor(null).definition, prefix);
    for (let step = 0; step < 500_000; step++) {
      const result = machine.step();
      if (result.stopped) throw new Error(`缺少规则：${machine.currentState},${machine.tape.read(machine.headPosition)}`);
      if (machine.currentState === "G.next") break;
    }
    expect(readGijswijtOutput(machine.tape)).toEqual([...prefix, expected]);
    const suffix = machine.tape.entries().filter(([position]) => position >= prefix.map(term => `|${term}`).join("").length).map(([, text]) => text).join("");
    expect(suffix).toBe(`|${expected}`);
  });

  it("does not display a decimal term until its writing is complete and reads legacy saves", () => {
    expect(readGijswijtOutput(new Tape("□", [[0, "|"], [1, "1"], [2, "|#(pending)"], [3, "9"]]))).toEqual([1]);
    expect(readGijswijtOutput(new Tape("0", [[0, "1|O"], [1, "10"]]))).toEqual([1, 10]);
    const huge = "9007199254740993123456";
    expect(readGijswijtDecimalOutput(new Tape("□", [...`|${huge}`].map((char, i) => [i, char])))).toEqual([huge]);
  });

  it.each([[9, 10, true], [10, 10, false], [99, 10, false], [11, 12, true], [12, 12, false]])(
    "compares a decimal threshold %i against the next term %i", (threshold, next, halt) => {
      const machine = prefixMachine(machineFor(threshold).definition, Array(next).fill(1));
      for (let step = 0; step < 500_000; step++) {
        const result = machine.step();
        if (result.stopped) { expect(result.reason).toBe("halt"); break; }
        if (machine.currentState === "G.next") break;
      }
      expect(machine.currentState).toBe(halt ? "G.HALT" : "G.next");
      expect(readGijswijtOutput(machine.tape).at(-1)).toBe(next);
    },
  );
});

function prefixMachine(definition: TuringMachine["definition"], prefix: number[]): TuringMachine {
  const text = prefix.map(term => `|${term}`).join("");
  return new TuringMachine({ ...definition, initialState: "G.next" }, [
    [-2, "1#(both)"], [-1, "@"], ...[...text].map((char, position): [number, string] => [position, char]),
  ], text.length);
}
