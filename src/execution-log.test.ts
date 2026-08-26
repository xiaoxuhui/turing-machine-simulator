import { describe, expect, it } from "vitest";
import { executionLogRows } from "./execution-log";

describe("executionLogRows", () => {
  it("keeps HTML-shaped machine fields as inert display text", () => {
    const payload = `<img src=x onerror="globalThis.pwned=true">`;
    const [row] = executionLogRows([{
      step: 1,
      fromState: payload,
      readSymbol: "<script>",
      toState: "HALT",
      writeSymbol: "□",
      direction: "N",
      headBefore: 0,
      headAfter: 0,
    }]);

    expect(row.step).toBe("#1");
    expect(row.detail).toContain(payload);
    expect(row.detail).toContain("<script>");
  });

  it("returns the latest records first and limits the list", () => {
    const records = Array.from({ length: 4 }, (_, index) => ({
      step: index + 1,
      fromState: "q0",
      readSymbol: "1",
      toState: "q0",
      writeSymbol: "1",
      direction: "R" as const,
      headBefore: index,
      headAfter: index + 1,
    }));

    expect(executionLogRows(records, 2).map((row) => row.step)).toEqual(["#4", "#3"]);
  });
});
