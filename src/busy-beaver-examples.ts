import catalog from "./busy-beaver-records.json";
import type { ExampleProject } from "./examples";

const labels: Record<string, string> = { proven: "已证步数冠军", current: "纪录下界", historical: "历史记录", unverified: "待核验纪录", conditional: "条件纪录" };
export const busyBeaverSnapshot = catalog.checkedAt;
export const busyBeaverMachineCount = catalog.records.length;
export const busyBeaverReferenceCount = catalog.references.length;
const numbered = new Map<string, number>();

function makeProject(record: typeof catalog.records[number]): ExampleProject {
  const size = `${record.states}x${record.symbols}`;
  const serial = (numbered.get(size) ?? 0) + 1; numbered.set(size, serial);
  let rules = record.rules ?? "", initialState = record.initialState ?? "A";
  if (record.table) {
    const rowWidth = record.symbols * 3;
    const state = (index: number) => record.states >= 26 ? `q${index + 1}` : String.fromCharCode(65 + index);
    initialState = state(0);
    const lines: string[] = [];
    for (let row = 0; row < record.states; row++) {
      const body = record.table.slice(row * (rowWidth + 1), row * (rowWidth + 1) + rowWidth);
      if (body.length !== rowWidth || row > 0 && record.table[row * (rowWidth + 1) - 1] !== "_") throw new Error(`忙碌海狸表格长度错误：${record.id}`);
      for (let read = 0; read < record.symbols; read++) {
        const op = body.slice(read * 3, read * 3 + 3);
        if (op === "---") { lines.push(`${state(row)},${read}->HALT,*,N`); continue; }
        if (!/^\d[LR].$/.test(op) || Number(op[0]) >= record.symbols) throw new Error(`忙碌海狸指令错误：${record.id}`);
        const next = op.charCodeAt(2) - 65;
        const terminal = next >= record.states && (op[2] === "Z" || op[2] === "H");
        if (!terminal && (next < 0 || next >= record.states)) throw new Error(`忙碌海狸状态越界：${record.id}`);
        lines.push(`${state(row)},${read}->${terminal ? "HALT" : state(next)},${op[0]},${op[1]}`);
      }
    }
    rules = lines.join("\n");
  }
  const exact = /^[\d,\s]+$/.test(record.runtime) ? `来源记录运行 ${record.runtime.trim()} 步。` : "运行数量级与验证情况见记录来源。";
  return {
    category: "忙碌海狸", name: `忙碌海狸 · ${record.states} 状态 ${record.symbols} 符号 · ${labels[record.kind]} #${serial}`,
    description: `从全 0 空纸带出发；${labels[record.kind]}。${exact}状态数不含普通停机态。${record.table?.includes("---") ? "来源中 --- 的未定义出口转换为保持符号、原地停机；其余指令逐条对应。" : ""}`,
    input: "", blankSymbol: "0", initialState, haltStates: "HALT", acceptStates: "", rejectStates: "", rules, maxSteps: null,
    sourceUrl: record.sources.at(-1)!.url,
  };
}

/** Deliberately separate from the educational catalog: these are laboratory-only. */
export const busyBeaverExamples: Record<string, ExampleProject> = {
  ...Object.fromEntries(catalog.records.map(record => [record.id, makeProject(record)])),
  ...Object.fromEntries(catalog.references.map(record => [
    `beaver-reference-${record.states}x${record.symbols}`,
    { category: "忙碌海狸", name: `忙碌海狸 · ${record.states} 状态 ${record.symbols} 符号 · 资料记录（无可用规则）`,
      description: `${labels[record.kind]}，目前来源条目未提供可导入的完整规则表。保留资料入口，不编造转移规则。`,
      sourceUrl: record.links[0] ?? record.source, unavailableReason: "这条记录没有可用的完整机器规则，请查看记录来源。",
      input: "", blankSymbol: "0", initialState: "A", haltStates: "HALT", acceptStates: "", rejectStates: "", rules: "", maxSteps: null,
    } satisfies ExampleProject,
  ])),
};
