import { describe, expect, it } from "vitest";
import { shuffled } from "./shuffle";

describe("shuffled", () => {
  it("uses an injectable Fisher-Yates sequence", () => {
    const samples = [0, 0.5, 0.9];
    expect(shuffled(["a", "b", "c", "d"], () => samples.shift()!)).toEqual(["d", "c", "b", "a"]);
  });

  it("does not mutate or lose source elements", () => {
    const source = [1, 2, 3, 4];
    const result = shuffled(source, () => 0);
    expect(source).toEqual([1, 2, 3, 4]);
    expect([...result].sort()).toEqual(source);
  });
});
