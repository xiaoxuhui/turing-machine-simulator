import { expect, it } from "vitest";
import { parseFunctionParameters } from "../src/function-parameters";

it("parses only trailing arguments, keeping direct symbols separate from bindings", () => {
  expect(parseFunctionParameters(["动作=右移", "函数", "出口=q1", "状态", "1", "符号", "C1", "symbol", "=", "字符"])).toEqual({
    parameters: [
      { alias: "动作", value: "右移", type: "function" }, { alias: "出口", value: "q1", type: "state" },
      { alias: "1", value: "1", type: "symbol" }, { alias: "C1", value: "C1", type: "symbol" }, { alias: "=", value: "=", type: "symbol" },
    ], errors: [],
  });
});
it("retains legacy functions and infers untyped equal bindings after function lookup", () => {
  expect(parseFunctionParameters(["写一", "首=写二"]).parameters).toEqual([
    { alias: "写一", value: "写一", type: "function" }, { alias: "首", value: "写二", type: "auto" },
  ]);
});
it.each([["x=f", "函数", "x=q", "状态"], ["=q", "state"], ["a=b=c", "fn"], ["", "symbol"]])("rejects invalid or repeated arguments: %s", (...fields) => {
  expect(parseFunctionParameters(fields).errors.length).toBeGreaterThan(0);
});
