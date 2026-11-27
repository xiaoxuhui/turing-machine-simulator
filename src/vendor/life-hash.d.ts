export class World {
  constructor(points: Array<[number, number]>);
  generation: number; root: number; x: number; y: number; levels: Uint8Array;
  advance(steps: number): void;
  get(x: number, y: number): number;
  set(x: number, y: number, value: number): void;
  view(bounds: { left: number; top: number; right: number; bottom: number; block: number }): Float64Array;
}
