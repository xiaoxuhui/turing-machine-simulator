import { expect, it } from "vitest";
import { routeHeadColor, routeSymbolColor, ROUTE_BLANK_COLOR, ROUTE_HEAD_COLOR } from "../src/route-colors";

it("gives common nonblank symbols distinct stable colors", () => {
  const symbols = ["0", "1", "X", "Y", "l", "o", "C1", "Cl", "S"];
  const colors = symbols.map(symbol => routeSymbolColor(symbol, "□"));
  expect(new Set(colors).size).toBe(symbols.length);
  for (const symbol of [...symbols, "中文", "🟩", "__proto__", "<script>"]) {
    expect(routeSymbolColor(symbol, "□")).toMatch(/^#[\da-f]{6}$/);
    expect(routeSymbolColor(symbol, "□")).toBe(routeSymbolColor(symbol, "□"));
  }
});
it("treats the requested blank symbol as blank, including zero", () => {
  expect(routeSymbolColor("0", "0")).toBe(ROUTE_BLANK_COLOR);
  expect(routeSymbolColor("□", "□")).toBe(ROUTE_BLANK_COLOR);
  expect(routeSymbolColor("0", "□")).not.toBe(ROUTE_BLANK_COLOR);
  expect(routeHeadColor("0", "0")).toBe(ROUTE_HEAD_COLOR);
});
it("mixes thirty percent of the symbol color into the pink head", () => {
  expect(routeHeadColor("X", "□")).toBe("#b95998");
  expect(routeHeadColor("1", "□")).toBe("#ae5b6b");
  expect(routeHeadColor("X", "□")).not.toBe(routeHeadColor("Y", "□"));
});
