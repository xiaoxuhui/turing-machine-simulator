import { describe, expect, it, vi } from "vitest";
import { RouteController, type RouteCallbacks } from "../src/route-controller";
import type { MachineDefinition } from "../src/core";

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  emit(data: unknown): void { this.onmessage?.({ data } as MessageEvent); }
}

const definition: MachineDefinition = { blankSymbol: "□", initialState: "q0", acceptStates: [], rejectStates: [], haltStates: [], transitions: [] };

function callbacks(): RouteCallbacks {
  return { onStart: vi.fn(), onProgress: vi.fn(), onComplete: vi.fn(), onError: vi.fn(), onCancel: vi.fn() };
}

describe("route controller", () => {
  it("cleans up after completion", () => {
    const worker = new FakeWorker(), cb = callbacks();
    const controller = new RouteController(() => worker, cb);
    controller.start({ definition, initialTape: [], maxSteps: 20 });
    worker.emit({ type: "complete", frames: [], min: 0, max: 0, reason: "step-limit" });
    expect(cb.onComplete).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(controller.running).toBe(false);
  });

  it("recovers from reported and unexpected worker errors", () => {
    const first = new FakeWorker(), second = new FakeWorker(), cb = callbacks();
    const workers = [first, second];
    const controller = new RouteController(() => workers.shift()!, cb);
    controller.start({ definition, initialTape: [], maxSteps: 20 });
    first.emit({ type: "error", message: "bad route" });
    expect(cb.onError).toHaveBeenLastCalledWith("bad route");
    expect(controller.running).toBe(false);
    controller.start({ definition, initialTape: [], maxSteps: 20 });
    second.onerror?.({} as ErrorEvent);
    expect(cb.onError).toHaveBeenLastCalledWith("Worker 意外停止，可重新生成。");
    expect(controller.running).toBe(false);
  });

  it("ignores callbacks from a worker replaced by a newer task", () => {
    const first = new FakeWorker(), second = new FakeWorker(), cb = callbacks();
    const workers = [first, second];
    const controller = new RouteController(() => workers.shift()!, cb);
    controller.start({ definition, initialTape: [], maxSteps: 20 });
    const staleMessage = first.onmessage!;
    const staleError = first.onerror!;

    controller.start({ definition, initialTape: [], maxSteps: 40 });
    staleMessage({ data: { type: "complete", frames: [], min: 0, max: 0, reason: "step-limit" } } as MessageEvent);
    staleError({} as ErrorEvent);

    expect(cb.onComplete).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
    expect(second.terminate).not.toHaveBeenCalled();
    expect(controller.running).toBe(true);
    second.emit({ type: "complete", frames: [], min: 0, max: 0, reason: "step-limit" });
    expect(cb.onComplete).toHaveBeenCalledOnce();
    expect(controller.running).toBe(false);
  });
});
