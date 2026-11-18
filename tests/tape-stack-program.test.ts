import { expect, it } from "vitest";
import { parseTransitions, TuringMachine } from "../src/core";
import { TapeStackProgram, type TapeStack } from "../src/tape-stack-program";

function run(indirect: boolean, peek = false) {
  const p = new TapeStackProgram("test", "T", "H", "R", value => value, "|");
  const a: TapeStack = { name: "A", values: ["1", "2"] };
  const b: TapeStack = { name: "B", values: ["x"] };
  const printRest = peek ? p.take(a, value => p.emit(value, p.end), "R") : p.end;
  const printA = p.take(a, value => p.emit(value, printRest), "R");
  const print = p.take(b, value => p.emit(value, printA), "R");
  const replace = (value: string) => {
    const push = p.push(a, peek ? value : "2", print);
    return indirect ? p.jump(p.label(), push) : push;
  };
  const edit = peek ? p.peek(a, replace, "R") : p.take(a, replace, "R");
  p.readInput({ name: "I", values: [] }, p.push(a, "1", p.push(b, "x", edit)));
  const parsed = parseTransitions(p.finish(), { haltStates: ["H"], rejectStates: ["R"] });
  expect(parsed.errors).toEqual([]);
  const machine = new TuringMachine({ initialState: p.start, blankSymbol: "|", transitions: parsed.transitions,
    haltStates: ["H"], acceptStates: [], rejectStates: ["R"],
  }, []);
  for (let step = 0; step < 1000; step++) {
    const result = machine.step();
    if (!result.stopped) continue;
    expect(result.reason).toBe("halt");
    return { output: machine.tape.entries(), steps: machine.stepCount };
  }
  throw new Error("Stack program did not finish");
}

it("rewrites an existing entry in place without disturbing another stack", () => {
  const fused = run(false), original = run(true);
  expect(fused.output).toEqual(original.output);
  expect(fused.output.map(([, value]) => value).join("")).toBe("x2");
  expect(fused.steps).toBeLessThan(original.steps);
});

it("keeps peek followed by push as a copy rather than replacing the entry", () => {
  const direct = run(false, true);
  expect(direct.output).toEqual(run(true, true).output);
  expect(direct.output.map(([, value]) => value).join("")).toBe("x11");
});
