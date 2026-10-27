import { describe, expect, it } from "vitest";
import { insertAtSelection, insertIndentedNewline } from "../src/text-insertion";

describe("symbol keyboard insertion", () => {
  it("starts a four-space function body after a colon", () => {
    const value = "追加(q0):";
    expect(insertIndentedNewline({ value, selectionStart: value.length, selectionEnd: value.length }))
      .toEqual({ value: `${value}\n    `, caret: value.length + 5 });
  });

  it("retains existing spaces on the next rule and replaces a selection", () => {
    const line = "    q0,1 -> q0,1,R";
    expect(insertIndentedNewline({ value: `${line}old`, selectionStart: line.length, selectionEnd: line.length + 3 }))
      .toEqual({ value: `${line}\n    `, caret: line.length + 5 });
  });
  it("inserts a symbol at the caret", () => {
    expect(insertAtSelection({ value: "q0, ->", selectionStart: 3, selectionEnd: 3 }, "□"))
      .toEqual({ value: "q0,□ ->", caret: 4 });
  });

  it("replaces the selected text", () => {
    expect(insertAtSelection({ value: "q0,x ->", selectionStart: 3, selectionEnd: 4 }, "□"))
      .toEqual({ value: "q0,□ ->", caret: 4 });
  });

  it("falls back to the end when no selection is available", () => {
    expect(insertAtSelection({ value: "q0", selectionStart: null, selectionEnd: null }, ","))
      .toEqual({ value: "q0,", caret: 3 });
  });
});
