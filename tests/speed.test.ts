import { describe, expect, it } from "vitest";
import { measuredSpeed, normalizeSpeed } from "../src/speed";

describe("execution speed", () => {
  it("supports targets up to one thousand steps per second", () => {
    expect(normalizeSpeed(1000)).toBe(1000);
    expect(normalizeSpeed(4000)).toBe(1000);
    expect(normalizeSpeed(0)).toBe(1);
  });

  it("reports speed from actual completed work and elapsed time", () => {
    expect(measuredSpeed(250, 500)).toBe(500);
    expect(measuredSpeed(0, 500)).toBe(0);
  });
});
