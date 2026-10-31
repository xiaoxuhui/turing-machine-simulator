import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MachineDefinition } from "../src/core";
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
function generate(transitions: MachineDefinition["transitions"], initialTape: RouteRequest["initialTape"] = [[0, "1"]], maxSteps = 10000): RouteComplete {
  worker.onmessage!(new MessageEvent<RouteRequest>("message", { data: { definition: { blankSymbol: "0", initialState: "q0", haltStates: ["HALT"], acceptStates: [], rejectStates: [], transitions }, initialTape, maxSteps } }));
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
