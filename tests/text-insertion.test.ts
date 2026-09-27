import { describe, expect, it } from "vitest";
import { insertAtSelection } from "../src/text-insertion";

describe("symbol keyboard insertion", () => {
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
