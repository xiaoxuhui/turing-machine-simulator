import { expect, it } from "vitest";
import { ruleDiagnostics, sourceLineRange } from "../src/rule-diagnostics";
import { parseTransitions } from "../src/core";

it("maps only valid source line numbers and keeps reasons as text", () => {
  expect(ruleDiagnostics("a\nb", ["第 2 行：缺少冒号", "第 2 行：缺少冒号", "未指定初始状态", "第 3 行：越界"])).toEqual([
    { line: 2, message: "第 2 行：缺少冒号" }, { message: "未指定初始状态" }, { message: "第 3 行：越界" },
  ]);
});
it("locates blank lines and CRLF without selecting the newline", () => {
  expect(sourceLineRange("abc\r\n\r\ndef", 1)).toEqual({ start: 0, end: 3 });
  expect(sourceLineRange("abc\r\n\r\ndef", 2)).toEqual({ start: 5, end: 5 });
  expect(sourceLineRange("abc\r\n\r\ndef", 3)).toEqual({ start: 7, end: 10 });
  expect(sourceLineRange("a\n", 99)).toEqual({ start: 2, end: 2 });
});
it("explains the user's dot typo on line 100 in flat and function programs", () => {
  const line = "0,l->1,l.L";
  const flat = "\n".repeat(99) + line;
  expect(parseTransitions(flat).errors[0]).toContain("第 100 行：写入符号和移动方向之间要用逗号");
  const source = "f(s,end):\n    s,1->end,1,N\n" + "\n".repeat(97) + line;
  expect(parseTransitions(source).errors[0]).toContain("第 100 行：写入符号和移动方向之间要用逗号");
  expect(parseTransitions(source.replace("l.L", "l,L")).errors).toEqual([]);
});
it("removes diagnostics after correction and accepts direct function calls", () => {
  const source = "f(s,end):\n    s,1->end,1,N\nstart,1->f";
  expect(ruleDiagnostics(source, parseTransitions(source).errors)).toEqual([]);
});
