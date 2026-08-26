import type { MachineDefinition } from "./core";

export interface RouteFrame { step: number; state: string; head: number; cells: Array<[number, string]> }
export interface RouteRequest { definition: MachineDefinition; initialTape: Array<[number, string]>; maxSteps: number }
export interface RouteComplete { frames: RouteFrame[]; min: number; max: number; reason: string }
export interface RouteCallbacks {
  onStart(maxSteps: number): void;
  onProgress(step: number, maxSteps: number): void;
  onComplete(result: RouteComplete): void;
  onError(message: string): void;
  onCancel(): void;
}

interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export class RouteController {
  private worker: WorkerLike | null = null;

  constructor(private readonly createWorker: () => WorkerLike, private readonly callbacks: RouteCallbacks) {}

  get running(): boolean { return this.worker !== null; }

  start(request: RouteRequest): void {
    this.cleanup();
    const worker = this.createWorker();
    this.worker = worker;
    this.callbacks.onStart(request.maxSteps);
    worker.onmessage = (event) => {
      if (event.data.type === "progress") {
        this.callbacks.onProgress(event.data.step, event.data.maxSteps);
        return;
      }
      if (event.data.type === "error") {
        this.callbacks.onError(event.data.message || "未知后台错误");
        this.cleanup();
        return;
      }
      if (event.data.type === "complete") {
        this.callbacks.onComplete(event.data as RouteComplete);
        this.cleanup();
      }
    };
    worker.onerror = () => {
      this.callbacks.onError("Worker 意外停止，可重新生成。");
      this.cleanup();
    };
    worker.postMessage(request);
  }

  cancel(): void {
    if (!this.worker) return;
    this.cleanup();
    this.callbacks.onCancel();
  }

  private cleanup(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
