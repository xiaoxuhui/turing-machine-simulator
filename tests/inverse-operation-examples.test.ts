import { expect, it } from "vitest";
import { parseTransitions, inputToTape, TuringMachine } from "../src/core";
import { inverseOperationExamples } from "../src/inverse-operation-examples";

const parsed = new Map(Object.entries(inverseOperationExamples).map(([key, project]) => [key, parseTransitions(project.rules)]));
function run(key: string, a: number | string, x: number, operator: string, expected: number | "reject"): number {
  const input = typeof a === "string" ? a : "1".repeat(a) + operator + "1".repeat(x);
  const machine = new TuringMachine({ blankSymbol: "□", initialState: "BOOT", haltStates: ["HALT"], acceptStates: [], rejectStates: ["REJECT"], transitions: parsed.get(key)!.transitions }, inputToTape(input, "□"));
  for (let step = 0; step < 10_000_000; step++) {
    const result = machine.step();
    if (result.stopped) {
      expect(result.reason, `${key}/${input}/${machine.stepCount}`).toBe(expected === "reject" ? "reject" : "halt");
      if (expected !== "reject") {
        const cells = machine.tape.entries();
        expect(cells.map(([, symbol]) => symbol).join(""), input).toBe("1".repeat(expected));
        expect(cells.every(([position], index) => position === cells[0][0] + index)).toBe(true);
      }
      return machine.stepCount;
    }
  }
  throw new Error(`${key}/${input} exceeded 10000000 tape steps`);
}

const cases = [
  ["unaryRoot", 3, true, "~"], ["unaryLog", 3, false, "@"],
  ["unarySuperRoot", 4, true, "~~"], ["unarySuperLog", 4, false, "@@"],
  ["unaryPentaRoot", 5, true, "~~~"], ["unaryPentaLog", 5, false, "@@@"],
] as const;

// Test-only bounded mathematical oracle; implementation values are never precomputed.
function forward(rank: number, a: number, b: number, limit: number): number {
  if (rank === 2) return Math.min(limit + 1, a * b);
  let result = 1;
  for (let n = 0; n < b; n++) {
    result = forward(rank - 1, a, result, limit);
    if (result > limit) return limit + 1;
  }
  return result;
}
function inverse(rank: number, root: boolean, a: number, x: number): number {
  let answer = 0;
  for (let candidate = 1; candidate <= x + 1; candidate++) {
    if (forward(rank, root ? candidate : a, root ? a : candidate, x) > x) break;
    answer = candidate;
  }
  return answer;
}

it("compiles six finite plain TM programs with Max and no speed override", () => {
  for (const [key, project] of Object.entries(inverseOperationExamples)) {
    expect(parsed.get(key)!.errors).toEqual([]);
    expect(parsed.get(key)!.transitions.length).toBeLessThan(100000);
    expect(project.maxSteps).toBeNull();
    expect(project).not.toHaveProperty("speed");
  }
});
it.each(cases)("runs the default %s using actual tape steps", (key, _rank, _root, operator) => {
  const steps = run(key, 2, 5, operator, 2);
  console.info(`${key}: ${steps} steps, ${parsed.get(key)!.transitions.length} rules`);
}, 20000);
it.each(cases)("matches bounded integer thresholds for %s", (key, rank, root, operator) => {
  for (let a = root ? 1 : 2; a <= 3; a++) for (let x = 1; x <= 8; x++) {
    run(key, a, x, operator, inverse(rank, root, a, x));
  }
}, 20000);
it("handles ordinary zero radicands and rejects undefined domains", () => {
  for (const degree of [1, 2, 3]) run("unaryRoot", degree, 0, "~", 0);
  for (const [key, _rank, root, operator] of cases) {
    run(key, 0, 3, operator, "reject");
    if (!root) run(key, 1, 3, operator, "reject");
    if (key !== "unaryRoot") run(key, 2, 0, operator, "reject");
  }
}, 20000);
it("keeps equality and floors non-exact inputs", () => {
  run("unaryRoot", 2, 9, "~", 3);
  run("unaryRoot", 2, 8, "~", 2);
  run("unaryLog", 2, 8, "@", 3);
  run("unaryLog", 2, 7, "@", 2);
  run("unarySuperLog", 2, 16, "@@", 3);
  run("unarySuperLog", 2, 15, "@@", 2);
  run("unarySuperRoot", 2, 27, "~~", 3);
  run("unaryPentaLog", 2, 3, "@@@", 1);
}, 20000);
it.each(cases)("rejects malformed separators for %s", (key, _rank, _root, operator) => {
  for (const input of ["111", `1${operator}0`, `1${operator}1${operator}1`, "1?1"]) run(key, input, 0, operator, "reject");
});
