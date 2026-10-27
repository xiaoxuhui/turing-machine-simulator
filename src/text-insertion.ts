export interface TextSelection {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

export interface TextInsertionResult {
  value: string;
  caret: number;
}

export function insertAtSelection(selection: TextSelection, text: string): TextInsertionResult {
  const start = selection.selectionStart ?? selection.value.length;
  const end = selection.selectionEnd ?? start;
  return {
    value: `${selection.value.slice(0, start)}${text}${selection.value.slice(end)}`,
    caret: start + text.length,
  };
}

export function insertIndentedNewline(selection: TextSelection): TextInsertionResult {
  const start = selection.selectionStart ?? selection.value.length;
  const line = selection.value.slice(selection.value.lastIndexOf("\n", start - 1) + 1, start);
  const spaces = line.match(/^ */)?.[0] ?? "";
  return insertAtSelection(selection, `\n${spaces}${line.trimEnd().endsWith(":") ? "    " : ""}`);
}

/** Insert literal spaces, not tabs, and retain function indentation on Enter. */
export function attachSpaceIndentation(editor: HTMLTextAreaElement): void {
  editor.addEventListener("keydown", event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing) return;
    if (event.key !== "Tab" && event.key !== "Enter") return;
    event.preventDefault();
    const result = event.key === "Tab" ? insertAtSelection(editor, "    ") : insertIndentedNewline(editor);
    editor.value = result.value;
    editor.setSelectionRange(result.caret, result.caret);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
