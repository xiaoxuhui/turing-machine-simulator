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
    this.cleanup(this.worker);
    const worker = this.createWorker();
    this.worker = worker;
    this.callbacks.onStart(request.maxSteps);
    worker.onmessage = (event) => {
      if (worker !== this.worker) return;
      if (event.data.type === "progress") {
        this.callbacks.onProgress(event.data.step, event.data.maxSteps);
        return;
      }
      if (event.data.type === "error") {
        this.callbacks.onError(event.data.message || "未知后台错误");
        this.cleanup(worker);
        return;
      }
      if (event.data.type === "complete") {
        this.callbacks.onComplete(event.data as RouteComplete);
        this.cleanup(worker);
      }
    };
    worker.onerror = () => {
      if (worker !== this.worker) return;
      this.callbacks.onError("Worker 意外停止，可重新生成。");
      this.cleanup(worker);
    };
    worker.postMessage(request);
  }

  cancel(): void {
    if (!this.worker) return;
    this.cleanup(this.worker);
    this.callbacks.onCancel();
  }

  private cleanup(worker: WorkerLike | null): void {
    if (!worker || worker !== this.worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    this.worker = null;
  }
}
