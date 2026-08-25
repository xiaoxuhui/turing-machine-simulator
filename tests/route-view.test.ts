import { describe, expect, it } from "vitest";
import { normalizeRouteSteps, routeCanvasSize, routeSampleIndex } from "../src/route-view";

describe("complete route view", () => {
  it("keeps a large route inside practical canvas limits", () => {
    expect(routeCanvasSize(100_001, 5000)).toEqual({ width: 1600, height: 2400 });
  });

  it("samples the first and last portions of a compressed route", () => {
    expect(routeSampleIndex(0, 100, 1000)).toBe(0);
    expect(routeSampleIndex(99, 100, 1000)).toBe(990);
  });

  it("accepts step counts beyond the old one hundred thousand limit", () => {
    expect(normalizeRouteSteps(2_500_000)).toBe(2_500_000);
    expect(normalizeRouteSteps(12.9)).toBe(12);
    expect(normalizeRouteSteps(0)).toBe(10000);
  });
});
