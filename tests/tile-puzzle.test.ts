import { describe, expect, it } from "vitest";
import { inputToTape, parseTransitions, type MachineDefinition } from "../src/core";
import { buildTilePuzzle, isSolved, tileFits } from "../src/tile-puzzle";

const unary: MachineDefinition = {
  blankSymbol: "□", initialState: "q0", acceptStates: [], rejectStates: [], haltStates: ["HALT"],
  transitions: parseTransitions("q0,1 -> q0,1,R\nq0,□ -> HALT,1,N").transitions,
};

describe("tile tableau puzzle", () => {
  it("turns the complete bounded execution into one tile per space-time cell", () => {
    const puzzle = buildTilePuzzle(unary, inputToTape("11", "□"), 8, 1);
    expect(puzzle.stopReason).toBe("halt");
    expect(puzzle.tiles).toHaveLength(puzzle.rows * puzzle.columns);
    expect(puzzle.tiles.filter((tile) => tile.isHead)).toHaveLength(puzzle.rows);
    expect(isSolved(puzzle, puzzle.solution)).toBe(true);
  });

  it("detects a repeated complete machine configuration", () => {
    const looping = { ...unary, haltStates: [], transitions: parseTransitions("q0,□ -> q0,□,N").transitions };
    expect(buildTilePuzzle(looping, [], 10).loop).toEqual({ start: 0, length: 1 });
  });

  it("only permits matching unused neighbours", () => {
    const puzzle = buildTilePuzzle(unary, inputToTape("1", "□"), 4, 1);
    const placed = Array<string | null>(puzzle.solution.length).fill(null);
    expect(tileFits(puzzle, placed, 0, puzzle.solution[0])).toBe(true);
    placed[0] = puzzle.solution[0];
    expect(tileFits(puzzle, placed, 1, puzzle.solution[1])).toBe(true);
    expect(tileFits(puzzle, placed, 1, puzzle.solution.at(-1)!)).toBe(false);
  });
});
