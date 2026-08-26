import { describe, expect, it } from "vitest";
import { expandPositionBounds } from "../src/route-bounds";

describe("route position bounds", () => {
  it("scans a very large tape without spreading positions as function arguments", () => {
    const positions = Array.from({ length: 150_000 }, (_, index) => index - 75_000);
    expect(expandPositionBounds({ min: 0, max: 0 }, positions)).toEqual({ min: -75_000, max: 74_999 });
  });

  it("preserves existing bounds for an empty iterable", () => {
    expect(expandPositionBounds({ min: -2, max: 4 }, [])).toEqual({ min: -2, max: 4 });
  });
});
