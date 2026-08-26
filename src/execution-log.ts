import type { StepRecord } from "./core";

export interface ExecutionLogRow {
  step: string;
  detail: string;
}

export function executionLogRows(records: readonly StepRecord[], limit = 120): ExecutionLogRow[] {
  return records.slice(-limit).reverse().map((record) => ({
    step: `#${record.step}`,
    detail: `${record.fromState},${record.readSymbol} → ${record.toState},${record.writeSymbol},${record.direction}　[${record.headBefore}→${record.headAfter}]`,
  }));
}

export function renderExecutionLog(host: HTMLElement, records: readonly StepRecord[]): void {
  host.replaceChildren();
  const rows = executionLogRows(records);
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "单步或运行后，这里会显示执行过程";
    host.append(empty);
    return;
  }

  for (const row of rows) {
    const container = document.createElement("div");
    container.className = "log-row";
    const step = document.createElement("span");
    const detail = document.createElement("span");
    step.textContent = row.step;
    detail.textContent = row.detail;
    container.append(step, detail);
    host.append(container);
  }
}
