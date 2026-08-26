import { describe, expect, it } from "vitest";
import { advanceStepCredit } from "../src/execution-scheduler";

describe("execution scheduler", () => {
  it("batches a 1000 step per second target without a one millisecond timer", () => {
    expect(advanceStepCredit(0, 16, 1000)).toEqual({ due: 16, credit: 0 });
  });

  it("carries fractional work between ticks and caps a long batch", () => {
    expect(advanceStepCredit(0.5, 100, 5)).toEqual({ due: 1, credit: 0 });
    expect(advanceStepCredit(0, 1000, 1000)).toEqual({ due: 250, credit: 750 });
  });
});
