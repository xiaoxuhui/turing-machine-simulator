import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseTransitions } from "../src/core";

let worker: { onmessage?: (event: MessageEvent) => void; postMessage: ReturnType<typeof vi.fn> };
beforeEach(async () => { vi.resetModules(); worker = { postMessage: vi.fn() }; vi.stubGlobal("self", worker); await import("../src/campaign-worker"); });
afterEach(() => vi.unstubAllGlobals());
const definition = { blankSymbol: "□", initialState: "q0", haltStates: ["HALT"], acceptStates: [], rejectStates: [] };
it("reports worker progress and completes a finite observation without blocking the UI", () => {
  worker.onmessage!(new MessageEvent("message", { data: { cases: [{ input: "", expectedOutput: "停止", mode: "status", expectedReason: "halt" }], maxSteps: 50001,
    definition: { ...definition, transitions: parseTransitions("q0,□->q0,□,R").transitions } } }));
  expect(worker.postMessage.mock.calls.some(([message]) => message.type === "progress")).toBe(true);
  expect(worker.postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "complete", result: { passed: false } });
});
it("returns invalid-machine errors through the worker message protocol", () => {
  const rule = parseTransitions("q0,□->HALT,1,N").transitions[0];
  worker.onmessage!(new MessageEvent("message", { data: { cases: [{ input: "", expectedOutput: "1" }], maxSteps: 5, definition: { ...definition, transitions: [rule, rule] } } }));
  expect(worker.postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "error", message: expect.stringContaining("重复规则") });
});
