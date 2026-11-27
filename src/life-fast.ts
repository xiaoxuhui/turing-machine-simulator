import { LifeWorld, type LifePattern, type LifePoint } from "./life";
import { World } from "./vendor/life-hash.js";

/** HashLife changes the evaluation algorithm, never the B3/S23 rule. */
export class FastLifeWorld extends LifeWorld {
  private fast: World;
  constructor(pattern: Pick<LifePattern, "cells" | "generation">) {
    super({ cells: [], generation: pattern.generation });
    this.fast = new World(pattern.cells.slice()); this.fast.generation = pattern.generation;
  }
  override get population() { return this.points().length; }
  override get(x: number, y: number) { return !!this.fast.get(x, y); }
  override set(x: number, y: number, alive: boolean) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error("细胞坐标必须是整数。");
    this.fast.set(x, y, Number(alive));
  }
  override points(): LifePoint[] {
    const { fast } = this, side = 2 ** fast.levels[fast.root];
    const flat = fast.view({ left: fast.x, top: fast.y, right: fast.x + side, bottom: fast.y + side, block: 1 }), points: LifePoint[] = [];
    for (let i = 0; i < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
    return points;
  }
  override step(): void { this.advance(1); }
  advance(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 2 ** 26 || !Number.isSafeInteger(this.generation + amount)) throw new Error("本次演化代数超出支持范围。");
    this.fast.advance(amount); this.generation = this.fast.generation;
  }
}
