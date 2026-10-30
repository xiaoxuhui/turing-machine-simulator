import "./rule-diagnostics.css";

export interface RuleDiagnostic { message: string; line?: number }

export function ruleDiagnostics(source: string, errors: string[]): RuleDiagnostic[] {
  const count = source.split("\n").length;
  return [...new Set(errors)].map(message => {
    const number = Number(message.match(/第\s*(\d+)\s*行/)?.[1]);
    return { message, ...(number >= 1 && number <= count ? { line: number } : {}) };
  });
}

export function sourceLineRange(source: string, line: number): { start: number; end: number } {
  const lines = source.split("\n");
  const index = Math.max(0, Math.min(lines.length - 1, Math.floor(line) - 1));
  const start = lines.slice(0, index).reduce((sum, text) => sum + text.length + 1, 0);
  return { start, end: start + lines[index].replace(/\r$/, "").length };
}

export function attachRuleDiagnostics(editor: HTMLTextAreaElement): { update(errors: string[]): void } {
  const frame = document.createElement("div"), layer = document.createElement("div"), list = document.createElement("div");
  frame.className = "rule-editor-frame";
  layer.className = "rule-error-layer";
  layer.setAttribute("aria-hidden", "true");
  list.className = "rule-diagnostics";
  list.id = `${editor.id}-diagnostics`;
  list.hidden = true;
  list.setAttribute("aria-live", "polite");
  editor.setAttribute("aria-describedby", [editor.getAttribute("aria-describedby"), list.id].filter(Boolean).join(" "));
  editor.wrap = "off";
  editor.before(frame);
  frame.append(editor, layer);
  frame.after(list);
  let diagnostics: RuleDiagnostic[] = [];
  const metrics = () => {
    const style = getComputedStyle(editor);
    return { height: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6, padding: parseFloat(style.paddingTop) || 0 };
  };
  const paint = () => {
    const { height, padding } = metrics();
    Object.assign(layer.style, { left: `${editor.clientLeft}px`, top: `${editor.clientTop}px`, width: `${editor.clientWidth}px`, height: `${editor.clientHeight}px` });
    layer.replaceChildren(...[...new Set(diagnostics.flatMap(item => item.line ? [item.line] : []))].map(line => {
      const mark = document.createElement("div");
      mark.className = "rule-error-line";
      mark.dataset.line = String(line);
      mark.style.top = `${padding + (line - 1) * height - editor.scrollTop}px`;
      mark.style.height = `${height}px`;
      return mark;
    }));
  };
  editor.addEventListener("scroll", paint);
  new ResizeObserver(paint).observe(editor);
  return { update(errors) {
    diagnostics = ruleDiagnostics(editor.value, errors);
    editor.setAttribute("aria-invalid", String(diagnostics.length > 0));
    list.hidden = diagnostics.length === 0;
    list.replaceChildren(...diagnostics.map(item => {
      const element = document.createElement(item.line ? "button" : "p");
      element.textContent = item.message;
      if (element instanceof HTMLButtonElement) {
        element.type = "button";
        element.dataset.line = String(item.line);
        element.addEventListener("click", event => {
          event.preventDefault();
          const range = sourceLineRange(editor.value, item.line!);
          editor.focus();
          editor.setSelectionRange(range.start, range.end);
          editor.scrollTop = Math.max(0, (item.line! - 2) * metrics().height);
          editor.scrollLeft = 0;
          paint();
        });
      }
      return element;
    }));
    paint();
  } };
}
