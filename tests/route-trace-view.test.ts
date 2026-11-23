import { expect, it } from "vitest";
import { traceValueAt } from "../src/route-trace-view";

it("finds the latest write, retaining the blank before the first write and after erasure", () => {
  const steps = new Float64Array([3, 5, 9]), values = new Uint32Array([1, 2, 0]);
  expect([0, 2, 3, 4, 5, 8, 9, 100].map(step => traceValueAt(steps, values, step))).toEqual([0, 0, 1, 1, 2, 2, 0, 0]);
  expect(traceValueAt(new Float64Array(), new Uint32Array(), 100)).toBe(0);
});
