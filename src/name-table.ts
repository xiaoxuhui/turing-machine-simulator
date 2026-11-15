import { renderRuleRows } from "./rule-table";

interface NameRow { value: string; details: string[]; editable?: boolean }

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

export function attachNameTable(
  panel: HTMLDetailsElement,
  snapshot: () => { rows: NameRow[]; invalid: boolean; revision: string },
  rename: (from: string, to: string) => void,
  options: { title: string; field: string; columns: string[]; encode?: (value: string) => string; decode?: (value: string) => string },
): () => void {
  const summary = panel.querySelector("summary")!;
  const message = panel.querySelector<HTMLElement>(".name-table-status")!;
  const table = panel.querySelector<HTMLElement>(".name-table")!;
  const encode = options.encode ?? (value => value);
  const decode = options.decode ?? (value => value);
  const header = '<div class="rule-row rule-head" role="row">' +
    options.columns.map(column => `<span role="columnheader">${escape(column)}</span>`).join("") + "</div>";
  const drafts = new Map<string, string>();
  const pending = new Map<string, number>();
  let revision = "";
  let focusAs: string | undefined;
  let applying = false;
  let stopRows: (() => void) | undefined;
  let values: string[] = [];

  const report = (text: string, failed = false) => {
    message.textContent = text;
    message.classList.toggle("error", failed);
  };
  const render = () => {
    if (!panel.open) return;
    const current = snapshot();
    const active = document.activeElement;
    const focused = active instanceof HTMLInputElement && table.contains(active) ? active : undefined;
    const focusedName = focusAs ?? values[Number(focused?.dataset.index)];
    const selection = focused ? [focused.selectionStart, focused.selectionEnd] as const : undefined;
    if (revision !== current.revision) {
      if (!applying) {
        for (const timer of pending.values()) window.clearTimeout(timer);
        pending.clear();
        drafts.clear();
      }
      revision = current.revision;
    }
    const { rows } = current;
    values = rows.map(row => row.value);
    summary.textContent = current.invalid ? options.title : `${options.title}（${rows.length} 个）`;
    table.hidden = current.invalid;
    report(current.invalid ? "请先修正转移规则。" : "");
    stopRows?.();
    if (current.invalid) { table.replaceChildren(); return; }
    if (!rows.length) {
      table.innerHTML = '<div class="empty">暂无条目</div>';
      return;
    }
    stopRows = renderRuleRows(table, header, rows.length, index => {
      const row = rows[index], name = encode(row.value);
      const cells = [name, ...row.details].map(value => `<span role="cell">${escape(value)}</span>`).join("");
      const editor = row.editable === false ? "源码管理" : `<input data-index="${index}" value="${escape(drafts.get(row.value) ?? name)}" aria-label="${escape(`将${options.field} ${name} 改为`)}" spellcheck="false" />`;
      return `<div class="rule-row" role="row" data-index="${index}">${cells}<span role="cell">${editor}</span></div>`;
    });
    const restoreFocus = focusedName === undefined ? null : table.querySelector<HTMLInputElement>(`input[data-index="${values.indexOf(focusedName)}"]`);
    if (restoreFocus && selection) {
      restoreFocus.focus({ preventScroll: true });
      restoreFocus.setSelectionRange(selection[0], selection[1]);
    }
  };

  const cancel = (from: string) => {
    window.clearTimeout(pending.get(from));
    pending.delete(from);
  };

  const apply = (from: string) => {
    cancel(from);
    if (!panel.open && snapshot().revision !== revision) return;
    const text = drafts.get(from)?.trim();
    if (!text) return;
    const next = decode(text);
    if (next === from) return;
    const active = document.activeElement;
    focusAs = active instanceof HTMLInputElement && table.contains(active) && values[Number(active.dataset.index)] === from ? next : undefined;
    applying = true;
    try {
      rename(from, next);
      drafts.delete(from);
      report(`已将 ${encode(from)} 改为 ${encode(next)}。`);
    } catch (error) {
      report(error instanceof Error ? error.message : "改名失败。", true);
    } finally {
      applying = false;
      focusAs = undefined;
    }
  };

  const update = (input: HTMLInputElement, composing = false) => {
    const from = values[Number(input.dataset.index)];
    if (from === undefined) return;
    cancel(from);
    drafts.set(from, input.value);
    if (!composing && input.value.trim()) pending.set(from, window.setTimeout(() => apply(from), 350));
  };

  panel.addEventListener("toggle", render);
  table.addEventListener("input", event => {
    if (event.target instanceof HTMLInputElement) update(event.target, event instanceof InputEvent && event.isComposing);
  });
  table.addEventListener("compositionend", event => {
    if (event.target instanceof HTMLInputElement) update(event.target);
  });
  table.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing || !(event.target instanceof HTMLInputElement)) return;
    const input = event.target;
    const from = values[Number(input.dataset.index)];
    if (from === undefined) return;
    event.preventDefault();
    update(input);
    apply(from);
  });
  return render;
}
