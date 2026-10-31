import { expect, it } from "vitest";
import { createRoutePalette, routeHeadColor, ROUTE_BLANK_COLOR, ROUTE_HEAD_COLOR, ROUTE_COLOR_STOPS } from "../src/route-colors";

it("reserves red for the head and uses yellow-green-blue for symbols", () => {
  expect([...createRoutePalette(["a", "b", "c"], "0").values()]).toEqual(ROUTE_COLOR_STOPS);
  expect(ROUTE_COLOR_STOPS).not.toContain(ROUTE_HEAD_COLOR);
});
it("divides eight symbols into eight colors including interpolated midpoints", () => {
  const colors = [...createRoutePalette("abcdefgh", "0").values()];
  expect(colors).toEqual(["#eab308", "#9fba28", "#54c149", "#25bd71", "#2fa4aa", "#388ae3", "#678ebb", "#a8a161"]);
  expect(new Set(colors).size).toBe(8);
});
it("uses each nonblank symbol once in first occurrence order", () => {
  expect([...createRoutePalette(["0", "Y", "X", "Y", "1", "0"], "0")]).toEqual([
    ["Y", "#eab308"], ["X", "#22c55e"], ["1", "#3b82f6"],
  ]);
  expect([...createRoutePalette(["a"], "0")]).toEqual([["a", "#eab308"]]);
  expect(createRoutePalette(["0", "0"], "0").size).toBe(0);
});
it("does not derive colors from the characters or their names", () => {
  expect([...createRoutePalette(["中文", "__proto__", "<script>"], "□").values()]).toEqual(ROUTE_COLOR_STOPS);
});
it("mixes thirty percent of the assigned symbol color into the pink head", () => {
  expect(routeHeadColor("#3b82f6")).toBe("#b95998");
  expect(routeHeadColor("#ef4444")).toBe("#ef4662");
  expect(routeHeadColor()).toBe(ROUTE_HEAD_COLOR);
  expect(routeHeadColor(ROUTE_BLANK_COLOR)).toBe(ROUTE_HEAD_COLOR);
});
