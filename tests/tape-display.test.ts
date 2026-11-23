import { expect, it } from "vitest";
import { fullTapeDisplay, tapeDisplayPositions } from "../src/tape-display";

it("compacts invisible metadata but preserves spaces from the input", () => {
  const labels = new Map([[0, "A"], [1, ""], [2, ""], [3, "B"], [4, " "], [5, ""], [6, "C"]]);
  const read = (position: number) => labels.get(position) ?? "□";
  const positions = tapeDisplayPositions(0, read, true);
  expect(positions).not.toContain(1);
  expect(positions).not.toContain(2);
  expect(positions).not.toContain(5);
  expect(positions).toContain(4);
  expect(positions.filter(position => position >= 0 && position <= 6).map(read).join("")).toBe("AB C");
  expect(positions).toHaveLength(17);
});

it("shows the whole written tape including negative positions and the head", () => {
  const cells = Array.from({ length: 60 }, (_, i) => [i - 5, "x"] as const);
  const items = fullTapeDisplay(cells, 75, () => "x");
  const positions = items.flatMap(item => "position" in item ? [item.position] : []);
  for (const [position] of cells) expect(positions).toContain(position);
  expect(positions).toContain(75);
  expect(items).toContainEqual({ from: 55, to: 74 });
});

it("can show all characters without expanding enormous blank gaps", () => {
  const items = fullTapeDisplay([[0, "A"], [1_000_000_000, "B"]], 0, () => "x");
  expect(items.length).toBeLessThan(10);
  expect(items).toContainEqual({ from: 1, to: 999_999_999 });
});

it("keeps the actual head position visible when it reads an auxiliary mark", () => {
  const positions = tapeDisplayPositions(2, position => position === 2 ? "" : "x", true);
  expect(positions[8]).toBe(2);
  expect(tapeDisplayPositions(0, position => position === 2 ? "" : "x", true, 2)).toContain(2);
});

it("can show every physical position for inspecting the machine", () => {
  expect(tapeDisplayPositions(0, () => "", false)).toEqual(Array.from({ length: 17 }, (_, i) => i - 8));
});
