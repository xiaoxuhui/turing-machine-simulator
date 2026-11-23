/** Keep real spaces and unwritten cells, while compacting invisible annotations. */
export function tapeDisplayPositions(center: number, label: (position: number) => string, compact = false, head = center): number[] {
  if (!compact) return Array.from({ length: 17 }, (_, i) => center + i - 8);
  const before: number[] = [], after: number[] = [];
  for (let position = center - 1; before.length < 8; position--) if (position === head || label(position) !== "") before.push(position);
  for (let position = center + 1; after.length < 8; position++) if (position === head || label(position) !== "") after.push(position);
  return [...before.reverse(), center, ...after];
}

export type FullTapeItem = { position: number } | { from: number; to: number };

/** Show every written position and the head; collapse long unwritten gaps. */
export function fullTapeDisplay(entries: ReadonlyArray<readonly [number, string]>, head: number, label: (position: number) => string, compact = false): FullTapeItem[] {
  const positions = [...new Set([0, head, ...entries.map(([position]) => position)])].sort((a, b) => a - b);
  const result: FullTapeItem[] = [{ position: positions[0] - 1 }];
  let previous = positions[0] - 1;
  for (const position of positions) {
    const gap = position - previous - 1;
    if (gap > 3) result.push({ from: previous + 1, to: position - 1 });
    else for (let empty = previous + 1; empty < position; empty++) result.push({ position: empty });
    if (!compact || position === head || position === 0 || label(position) !== "") result.push({ position });
    previous = position;
  }
  result.push({ position: previous + 1 });
  return result;
}
