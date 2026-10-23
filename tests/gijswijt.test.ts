import { describe, expect, it } from "vitest";
import { appendGijswijtTerms, nextGijswijtTerm } from "../src/gijswijt";

describe("direct Gijswijt calculation", () => {
  it("generates the first 30 terms from the recurrence", () => {
    expect(appendGijswijtTerms([], 30)).toEqual([
      1, 1, 2, 1, 1, 2, 2, 2, 3, 1,
      1, 2, 1, 1, 2, 2, 2, 3, 2, 1,
      1, 2, 1, 1, 2, 2, 2, 3, 1, 1,
    ]);
  });
  it("compares repeated blocks and handles nonrepeating suffixes", () => {
    expect(nextGijswijtTerm([1, 2, 1, 2, 1, 2])).toBe(3);
    expect(nextGijswijtTerm([1, 2, 1, 3, 1])).toBe(1);
  });
  it("rejects invalid targets and preserves the source when continuing", () => {
    const prefix = [1, 1];
    expect(appendGijswijtTerms(prefix, 3)).toEqual([1, 1, 2]);
    expect(prefix).toEqual([1, 1]);
    for (const invalid of [0, 1, 1.5, NaN, Infinity]) expect(() => appendGijswijtTerms(prefix, invalid)).toThrow();
  });
  it("first writes 4 at position 220", () => {
    const sequence = appendGijswijtTerms([], 220);
    expect(sequence[219]).toBe(4);
    expect(sequence.slice(0, 219)).not.toContain(4);
  });
});
