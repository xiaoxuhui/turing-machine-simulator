export interface PositionBounds { min: number; max: number }

export function expandPositionBounds(bounds: PositionBounds, positions: Iterable<number>): PositionBounds {
  let { min, max } = bounds;
  for (const position of positions) {
    if (position < min) min = position;
    if (position > max) max = position;
  }
  return { min, max };
}
