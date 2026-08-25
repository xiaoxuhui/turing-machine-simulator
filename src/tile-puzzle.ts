import { TuringMachine, type MachineDefinition, type StopReason } from "./core";

export interface TileEdgeSet { top: string; right: string; bottom: string; left: string }
export interface TableauTile extends TileEdgeSet {
  id: string; row: number; column: number; symbol: string; state: string | null; isHead: boolean;
}
export interface LoopInfo { start: number; length: number }
export interface TilePuzzle {
  rows: number; columns: number; minPosition: number; tiles: TableauTile[];
  solution: string[]; loop: LoopInfo | null; stopReason: StopReason | "step-limit";
}

function snapshot(machine: TuringMachine): string {
  return JSON.stringify([machine.currentState, machine.headPosition, machine.tape.entries()]);
}

function edge(kind: string, a: number, b: number): string { return `${kind}:${a}:${b}`; }

export function buildTilePuzzle(
  definition: MachineDefinition,
  initialTape: Array<[number, string]>,
  maxSteps = 12,
  padding = 2,
): TilePuzzle {
  const machine = new TuringMachine(definition, initialTape);
  const frames: Array<{ state: string; head: number; cells: Array<[number, string]> }> = [];
  const seen = new Map<string, number>();
  let loop: LoopInfo | null = null;
  let stopReason: TilePuzzle["stopReason"] = "step-limit";

  for (let step = 0; step <= maxSteps; step += 1) {
    const key = snapshot(machine);
    const previous = seen.get(key);
    if (previous !== undefined) { loop = { start: previous, length: step - previous }; break; }
    seen.set(key, step);
    frames.push({ state: machine.currentState, head: machine.headPosition, cells: machine.tape.entries() });
    if (step === maxSteps) break;
    const result = machine.step();
    if (result.stopped) { stopReason = result.reason!; frames.push({ state: machine.currentState, head: machine.headPosition, cells: machine.tape.entries() }); break; }
  }

  const positions = frames.flatMap((frame) => [frame.head, ...frame.cells.map(([position]) => position)]);
  const minPosition = Math.min(0, ...positions) - padding;
  const maxPosition = Math.max(0, ...positions) + padding;
  const columns = maxPosition - minPosition + 1;
  const rows = frames.length;
  const tiles: TableauTile[] = [];
  for (let row = 0; row < rows; row += 1) {
    const cellMap = new Map(frames[row].cells);
    for (let column = 0; column < columns; column += 1) {
      const position = minPosition + column;
      tiles.push({
        id: `t-${row}-${column}`, row, column,
        symbol: cellMap.get(position) ?? definition.blankSymbol,
        state: frames[row].head === position ? frames[row].state : null,
        isHead: frames[row].head === position,
        top: row === 0 ? edge("border-top", 0, column) : edge("time", row - 1, column),
        bottom: row === rows - 1 ? edge("border-bottom", row, column) : edge("time", row, column),
        left: column === 0 ? edge("border-left", row, 0) : edge("space", row, column - 1),
        right: column === columns - 1 ? edge("border-right", row, column) : edge("space", row, column),
      });
    }
  }
  return { rows, columns, minPosition, tiles, solution: tiles.map((tile) => tile.id), loop, stopReason };
}

export function tileFits(puzzle: TilePuzzle, placed: Array<string | null>, slot: number, tileId: string): boolean {
  const tile = puzzle.tiles.find((item) => item.id === tileId);
  if (!tile || placed.includes(tileId) || slot < 0 || slot >= placed.length) return false;
  const row = Math.floor(slot / puzzle.columns), column = slot % puzzle.columns;
  const at = (index: number) => puzzle.tiles.find((item) => item.id === placed[index]);
  const top = row > 0 ? at(slot - puzzle.columns) : undefined;
  const left = column > 0 ? at(slot - 1) : undefined;
  const bottom = row < puzzle.rows - 1 ? at(slot + puzzle.columns) : undefined;
  const right = column < puzzle.columns - 1 ? at(slot + 1) : undefined;
  return (!top || top.bottom === tile.top) && (!left || left.right === tile.left) &&
    (!bottom || bottom.top === tile.bottom) && (!right || right.left === tile.right);
}

export function isSolved(puzzle: TilePuzzle, placed: Array<string | null>): boolean {
  return placed.length === puzzle.solution.length && placed.every((id, index) => id === puzzle.solution[index]);
}
