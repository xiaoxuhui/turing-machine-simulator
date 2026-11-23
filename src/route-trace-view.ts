import type { RouteTrace } from "./route-controller";
import { routeCanvasSize, routeSampleIndex } from "./route-view";
import { ROUTE_BLANK_COLOR, routeHeadColor } from "./route-colors";
import { visibleTapeSymbol } from "./symbol-annotations";

export function traceValueAt(steps: Float64Array, values: Uint32Array, step: number): number {
  let left = 0, right = steps.length;
  while (left < right) { const middle = (left + right) >>> 1; if (steps[middle] <= step) left = middle + 1; else right = middle; }
  return left ? values[left - 1] : 0;
}

/** A viewport over every time and position. No giant bitmap or sampled rows. */
export class RouteTraceView {
  private full = false;
  private frame: number | undefined;
  private rowOffset = 0;
  private readonly columns: Map<number, RouteTrace["columns"][number]>;
  private readonly onScroll = () => this.schedule();
  private readonly observer: ResizeObserver;
  private readonly onHover = (event: MouseEvent) => {
    if (!this.full) return;
    const rect = this.canvas.getBoundingClientRect();
    const step = this.rowOffset + Math.floor((this.viewport.scrollTop + event.clientY - rect.top) / 2);
    const position = this.min + Math.floor((this.viewport.scrollLeft + event.clientX - rect.left) / 8);
    if (step < 0 || step >= this.trace.heads.length || position > this.max) return;
    this.canvas.title = `第 ${step} 步 · 位置 ${position} · ${JSON.stringify(visibleTapeSymbol(this.symbol(step, position)))} · 状态 ${this.trace.states[this.trace.stateIds[step]]} · 读写头 ${this.trace.heads[step]}`;
  };

  constructor(private readonly viewport: HTMLElement, private readonly surface: HTMLElement, private readonly canvas: HTMLCanvasElement,
    private readonly trace: RouteTrace, private readonly min: number, private readonly max: number,
    private readonly colors: Map<string, string>, private readonly visible: (message: string) => void) {
    this.columns = new Map(trace.columns.map(column => [column.position, column]));
    viewport.addEventListener("scroll", this.onScroll);
    canvas.addEventListener("mousemove", this.onHover);
    this.observer = new ResizeObserver(() => this.schedule()); this.observer.observe(viewport);
  }

  setFull(full: boolean): void {
    this.full = full; this.rowOffset = 0;
    this.viewport.classList.toggle("full-route", full);
    this.surface.style.width = full ? `${(this.max - this.min + 1) * 8}px` : "";
    this.surface.style.height = full ? `${Math.min(8_000_000, this.trace.heads.length * 2)}px` : "";
    this.viewport.scrollTop = 0; this.viewport.scrollLeft = 0;
    this.schedule();
  }

  goToStep(step: number): void {
    if (!this.full) return;
    const lastWindow = Math.max(0, this.trace.heads.length - Math.floor(this.viewport.clientHeight / 2));
    const target = Math.max(0, Math.min(lastWindow, Math.floor(step)));
    const scrollRows = Math.max(0, Math.floor((this.surface.clientHeight - this.viewport.clientHeight) / 2));
    this.rowOffset = Math.max(0, target - scrollRows);
    this.viewport.scrollTop = (target - this.rowOffset) * 2; this.schedule();
  }

  destroy(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.viewport.removeEventListener("scroll", this.onScroll); this.canvas.removeEventListener("mousemove", this.onHover);
    this.observer.disconnect(); this.viewport.classList.remove("full-route");
    this.surface.style.width = ""; this.surface.style.height = ""; this.canvas.title = "";
  }

  private schedule(): void {
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.draw(); });
  }

  private symbol(step: number, position: number): string {
    const history = this.columns.get(position);
    return this.trace.symbols[history ? traceValueAt(history.steps, history.values, step) : 0];
  }

  private draw(): void {
    const size = this.full ? { width: Math.max(1, this.viewport.clientWidth), height: Math.max(1, this.viewport.clientHeight) }
      : routeCanvasSize(this.trace.heads.length, this.max - this.min + 1);
    this.canvas.width = size.width; this.canvas.height = size.height;
    const context = this.canvas.getContext("2d")!;
    context.fillStyle = ROUTE_BLANK_COLOR; context.fillRect(0, 0, size.width, size.height);
    const heads = new Map([...this.colors].map(([symbol, color]) => [symbol, routeHeadColor(color)]));
    const rowStart = this.rowOffset + Math.floor(this.viewport.scrollTop / 2), columnStart = Math.floor(this.viewport.scrollLeft / 8);
    const rows = this.full ? Math.ceil(size.height / 2) + 1 : size.height;
    const columns = this.full ? Math.ceil(size.width / 8) + 1 : size.width;
    for (let y = 0; y < rows; y++) {
      const step = this.full ? rowStart + y : routeSampleIndex(y, size.height, this.trace.heads.length);
      if (step >= this.trace.heads.length) break;
      for (let x = 0; x < columns; x++) {
        const position = this.min + (this.full ? columnStart + x : routeSampleIndex(x, size.width, this.max - this.min + 1));
        if (position > this.max) break;
        const symbol = this.symbol(step, position), isHead = this.trace.heads[step] === position;
        if (!isHead && symbol === this.trace.symbols[0]) continue;
        context.fillStyle = isHead ? heads.get(symbol) ?? routeHeadColor() : this.colors.get(symbol) ?? ROUTE_BLANK_COLOR;
        context.fillRect(this.full ? x * 8 - this.viewport.scrollLeft % 8 : x, this.full ? y * 2 - this.viewport.scrollTop % 2 : y, this.full ? 8 : 1, this.full ? 2 : 1);
      }
    }
    this.visible(this.full ? `当前可见第 ${rowStart}…${Math.min(this.trace.heads.length - 1, rowStart + rows - 1)} 步；完整记录 ${this.trace.heads.length} 个时刻。每行一步，不抽样，可纵横滚动或定位步数。` : "压缩总览；切换显示全部可逐步逐格查看。");
  }
}
