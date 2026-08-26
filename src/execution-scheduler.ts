import { measuredSpeed, normalizeSpeed } from "./speed";

export interface BatchResult { executed: number; keepRunning: boolean }
export interface SchedulerCallbacks {
  executeBatch(maxSteps: number): BatchResult;
  getTargetSpeed(): number;
  onTick(actualSpeed: number): void;
}

export function advanceStepCredit(credit: number, elapsedMs: number, targetSpeed: number, batchLimit = 250): { due: number; credit: number } {
  const accumulated = credit + Math.max(0, elapsedMs) * normalizeSpeed(targetSpeed) / 1000;
  const due = Math.min(batchLimit, Math.floor(accumulated));
  return { due, credit: accumulated - due };
}

export class ExecutionScheduler {
  private timer: number | null = null;
  private startedAt = 0;
  private lastTickAt = 0;
  private completed = 0;
  private credit = 0;

  constructor(private readonly callbacks: SchedulerCallbacks, private readonly now = () => performance.now()) {}

  get running(): boolean { return this.timer !== null; }

  start(): void {
    if (this.running) return;
    this.startedAt = this.now();
    this.lastTickAt = this.startedAt;
    this.completed = 0;
    this.credit = 0;
    this.callbacks.onTick(0);
    this.timer = window.setInterval(() => this.tick(), 16);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  tick(): void {
    if (!this.running) return;
    const now = this.now();
    const next = advanceStepCredit(this.credit, now - this.lastTickAt, this.callbacks.getTargetSpeed());
    this.credit = next.credit;
    this.lastTickAt = now;
    const result = next.due > 0 ? this.callbacks.executeBatch(next.due) : { executed: 0, keepRunning: true };
    this.completed += result.executed;
    const actual = measuredSpeed(this.completed, now - this.startedAt);
    if (!result.keepRunning) this.stop();
    this.callbacks.onTick(actual);
  }
}
