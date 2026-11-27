import { expect, it } from "vitest";
import { parseTransitions, TuringMachine } from "../src/core";
import { busyBeaverExamples, busyBeaverMachineCount, busyBeaverReferenceCount } from "../src/busy-beaver-examples";
import catalog from "../src/busy-beaver-records.json";

function compile(id: string): TuringMachine {
  const project = busyBeaverExamples[id];
  const parsed = parseTransitions(project.rules);
  expect(parsed.errors, id).toEqual([]);
  return new TuringMachine({ blankSymbol: project.blankSymbol, initialState: project.initialState, haltStates: [project.haltStates], acceptStates: [], rejectStates: [], transitions: parsed.transitions }, []);
}

it("covers every complete machine from the snapshot and marks references as unavailable", () => {
  expect(busyBeaverMachineCount).toBe(267);
  expect(busyBeaverReferenceCount).toBe(11);
  expect(Object.keys(busyBeaverExamples)).toHaveLength(278);
  for (const record of catalog.records) {
    const machine = compile(record.id);
    for (let i = 0; i < 250; i++) {
      const result = machine.step();
      if (result.stopped) { expect(result.reason, record.id).toBe("halt"); break; }
    }
    expect(busyBeaverExamples[record.id].maxSteps).toBeNull();
    expect(busyBeaverExamples[record.id].sourceUrl).toMatch(/^https:\/\//);
  }
  for (const project of Object.values(busyBeaverExamples).filter(project => project.unavailableReason)) {
    expect(project.rules).toBe("");
    expect(project.sourceUrl).toMatch(/^https:\/\//);
  }
});

it.each([[1, 2, 1, 1], [2, 2, 6, 4], [3, 2, 21, 5], [4, 2, 107, 13], [5, 2, 47176870, 4098], [2, 3, 38, 9], [2, 4, 3932964, 2050]])(
  "reproduces the verified %i-state %i-symbol machine (%i steps)", (states, symbols, steps, nonblank) => {
    const record = catalog.records.find(record => record.states === states && record.symbols === symbols && record.kind === "proven")!;
    const machine = compile(record.id);
    let reason: string | undefined;
    for (let i = 0; i <= steps; i++) { const result = machine.step(); if (result.stopped) { reason = result.reason; break; } }
    expect(reason).toBe("halt"); expect(machine.stepCount).toBe(steps);
    expect(machine.tape.entries()).toHaveLength(nonblank);
  }, 60_000,
);

it("keeps H as a real state in larger machines and Z as a real state beyond 25", () => {
  const eight = catalog.records.find(r => r.states === 8 && r.symbols === 2 && r.table?.includes("1LH"))!;
  expect(compile(eight.id).definition.transitions).toContainEqual({ fromState: "E", readSymbol: "0", toState: "H", writeSymbol: "1", direction: "L" });
  const large = catalog.records.find(r => r.states === 29 && r.symbols === 2)!;
  expect(compile(large.id).definition.transitions.some(rule => rule.toState === "q26")).toBe(true);
  const conditional = catalog.records.find(r => r.states === 27 && r.kind === "conditional")!;
  expect(compile(conditional.id).currentState).toBe("Q9");
});
