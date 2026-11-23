import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseTransitions, TuringMachine, type MachineDefinition } from "../src/core";
import { traceValueAt } from "../src/route-trace-view";
import type { RouteComplete, RouteRequest } from "../src/route-controller";

let worker: { onmessage?: (event: MessageEvent<RouteRequest>) => void; postMessage: ReturnType<typeof vi.fn> };
beforeEach(async () => {
  vi.resetModules();
  worker = { postMessage: vi.fn() };
  vi.stubGlobal("self", worker);
  await import("../src/route-worker");
});
afterEach(() => vi.unstubAllGlobals());
const rule = (fromState: string, readSymbol: string, toState: string, writeSymbol: string) => ({ fromState, readSymbol, toState, writeSymbol, direction: "N" as const });
function generate(transitions: MachineDefinition["transitions"], initialTape: RouteRequest["initialTape"] = [[0, "1"]], maxSteps = 10000, full = false): RouteComplete {
  worker.onmessage!(new MessageEvent<RouteRequest>("message", { data: { definition: { blankSymbol: "0", initialState: "q0", haltStates: ["HALT"], acceptStates: [], rejectStates: [], transitions }, initialTape, maxSteps, full } }));
  return worker.postMessage.mock.calls.find(([message]) => message.type === "complete")![0];
}
it("omits operators that only exist in unexecuted rules", () => {
  const result = generate([rule("q0", "1", "HALT", "1"), ...["+", "-", "*", "/", "?"].map(symbol => rule(`unused${symbol}`, "0", "HALT", symbol))]);
  expect(result.symbols).toEqual(["1"]);
});
it("retains a transient symbol even when no sampled frame contains it", () => {
  const result = generate([rule("q0", "1", "q1", "X"), rule("q1", "X", "q2", "0"), rule("q2", "0", "HALT", "1")]);
  expect(result.symbols).toEqual(["1", "X"]);
  expect(result.frames.every(frame => frame.cells.every(([, symbol]) => symbol !== "X"))).toBe(true);
});
it("retains initial input symbols but excludes blank writes", () => {
  expect(generate([rule("q0", "1", "HALT", "0")], [[0, "1"], [1, "+"], [2, "0"]]).symbols).toEqual(["1", "+"]);
});
it("does not include writes past the requested step limit", () => {
  const rules = [rule("q0", "1", "q1", "X"), rule("q1", "X", "HALT", "Y")];
  expect(generate(rules, [[0, "1"]], 1).symbols).toEqual(["1", "X"]);
});
it("executes wildcard rules using the actual unknown symbol and records literal star output", () => {
  const transitions = parseTransitions("q0,->next,*,R\n,->HALT,***,*").transitions;
  const result = generate(transitions, [[0, "未列出"]], 10);
  expect(result.reason).toBe("halt");
  expect(result.frames.at(-1)).toMatchObject({ step: 2, state: "HALT", head: 1, cells: [[0, "未列出"], [1, "**"]] });
  expect(result.symbols).toEqual(["未列出", "**"]);
});
it("records every moment beyond the overview sampling limit, including one-step symbols", () => {
  const trace = generate([rule("q0", "1", "q1", "X"), rule("q1", "X", "q0", "1")], [[0, "1"]], 5000, true).trace!;
  expect(trace.heads.length).toBe(5001);
  expect(trace.stateIds.length).toBe(5001);
  const column = trace.columns.find(column => column.position === 0)!;
  for (let step = 0; step <= 5000; step++) {
    expect(trace.symbols[traceValueAt(column.steps, column.values, step)]).toBe(step % 2 ? "X" : "1");
    expect(trace.states[trace.stateIds[step]]).toBe(step % 2 ? "q1" : "q0");
  }
});
it("reconstructs the exact tape, state and head at each step across movement and erasure", () => {
  const transitions = parseTransitions("q0,1->q1,X,L\nq1,0->q2,Y,R\nq2,X->q3,0,R\nq3,0->HALT,Z,L").transitions;
  const result = generate(transitions, [[0, "1"]], 20, true), trace = result.trace!;
  const machine = new TuringMachine({ blankSymbol: "0", initialState: "q0", haltStates: ["HALT"], acceptStates: [], rejectStates: [], transitions }, [[0, "1"]]);
  expect(trace.heads.length).toBe(5);
  expect([result.min, result.max]).toEqual([-1, 1]);
  for (let step = 0; step < trace.heads.length; step++) {
    expect(trace.heads[step]).toBe(machine.headPosition);
    expect(trace.states[trace.stateIds[step]]).toBe(machine.currentState);
    for (const column of trace.columns) expect(trace.symbols[traceValueAt(column.steps, column.values, step)]).toBe(machine.tape.read(column.position));
    machine.step();
  }
});
it("does not invent a step when a rule is missing", () => {
  const result = generate([], [[0, "1"]], 20, true);
  expect(result.trace!.heads.length).toBe(1);
  expect(result.frames.map(frame => frame.step)).toEqual([0]);
  expect(result.reason).toBe("missing-transition");
});
