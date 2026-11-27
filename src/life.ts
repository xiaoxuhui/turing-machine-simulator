/** An unbounded, synchronous B3/S23 universe. The viewport never limits evolution. */
export type LifePoint = [number, number];
export type LifeShape = "cell" | "eater" | "glider" | "lwss";
export interface LifePort { id: string; kind: "input" | "output"; label: string; x: number; y: number; shape: LifeShape; value: 0 | 1; switchCells?: LifePoint[] }
export interface LifePattern {
  cells: LifePoint[]; generation: number; ports: LifePort[];
  sampling?: { start: number; period: number };
  comments: string[];
  machine?: LifeMachineInfo;
}
export interface LifeReading { generation: number; values: Record<string, 0 | 1> }
export interface LifeMachineInfo {
  version: 1; left: number; right: number; period: number; states: string[]; symbols: string[];
  terminal: Array<"halt" | "accept" | "reject" | null>; rules: boolean[][];
  registers: { state: string[]; head: string[]; tape: string[][]; fault: string };
  stats: { gates: number; registers: number }; source: import("./project-state").MachineProjectFields;
}

// Same switch footprint and output phases as Logic Workshop's Conway ports.
export const LIFE_SHAPES: Record<LifeShape, LifePoint[]> = {
  cell: [[0, 0]],
  eater: [[0, 0], [1, 0], [0, 1], [2, 1], [2, 2], [2, 3], [3, 3]],
  glider: [[11, 10], [11, 12], [12, 12], [12, 11], [10, 12]],
  lwss: [[0, 0], [3, 0], [4, 1], [0, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3]],
};
const key = (x: number, y: number) => `${x},${y}`;
export const emptyLife = (): LifePattern => ({ cells: [], generation: 0, ports: [], comments: [] });
export function lifeBounds(cells: LifePoint[]) {
  if (!cells.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of cells) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return { minX, minY, maxX, maxY };
}
export class LifeWorld {
  private cells = new Map<string, LifePoint>();
  generation: number;
  constructor(pattern: Pick<LifePattern, "cells" | "generation">) {
    this.generation = pattern.generation;
    for (const [x, y] of pattern.cells) this.set(x, y, true);
  }
  get population() { return this.cells.size; }
  get(x: number, y: number) { return this.cells.has(key(x, y)); }
  set(x: number, y: number, alive: boolean) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error("细胞坐标必须为安全范围内的整数。");
    if (alive) this.cells.set(key(x, y), [x, y]); else this.cells.delete(key(x, y));
  }
  points(): LifePoint[] { return [...this.cells.values()]; }
  step(): void {
    if (!Number.isSafeInteger(this.generation + 1)) throw new Error("代数超出整数精度，请先导出当前图案。");
    const neighbors = new Map<string, [number, number, number]>();
    for (const [x, y] of this.cells.values()) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, id = key(nx, ny), item = neighbors.get(id);
      if (item) item[2]++; else neighbors.set(id, [nx, ny, 1]);
    }
    const next = new Map<string, LifePoint>();
    for (const [id, [x, y, count]] of neighbors) {
      if (count === 3 || (count === 2 && this.cells.has(id))) next.set(id, [x, y]);
    }
    this.cells = next;
    this.generation++;
  }
  read(port: LifePort): 0 | 1 {
    return Number(LIFE_SHAPES[port.shape].every(([dx, dy]) => this.get(port.x + dx, port.y + dy))) as 0 | 1;
  }
  toggle(port: LifePort): void {
    if (port.kind !== "input") throw new Error("输出端只读。");
    if (port.shape === "cell") {
      port.value = this.get(port.x, port.y) ? 0 : 1;
      this.set(port.x, port.y, !!port.value);
      return;
    }
    if (port.shape !== "eater") throw new Error("输入端需要单格或食者开关。");
    const footprint = port.switchCells ?? LIFE_SHAPES.eater;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const expected = !port.value && footprint.some(([x, y]) => dx === x && dy === y);
      if (this.get(port.x + dx, port.y + dy) !== expected) throw new Error("开关区域有信号经过或图案已改变，请推进几代后重试，或重置图案。");
    }
    for (const [dx, dy] of footprint) this.set(port.x + dx, port.y + dy, !!port.value);
    port.value = port.value ? 0 : 1;
  }
}
