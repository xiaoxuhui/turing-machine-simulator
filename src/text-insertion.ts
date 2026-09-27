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
