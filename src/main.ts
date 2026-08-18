import "./styles.css";
import { inputToTape, parseTransitions, TuringMachine, type MachineDefinition, type StepRecord } from "./core";
import { examples, type ExampleProject } from "./examples";

interface ProjectData extends ExampleProject {
  format: "turing-machine-simulator";
  version: 1;
  maxSteps: number;
  speed: number;
}

const STORAGE_KEY = "turing-machine-simulator.project.v1";
let machine: TuringMachine | null = null;
let records: StepRecord[] = [];
let timer: number | null = null;
let status = "就绪";
let stopMessage = "";

const defaultProject: ProjectData = {
  format: "turing-machine-simulator",
  version: 1,
  maxSteps: 10000,
  speed: 5,
  ...examples.unary,
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">TM</div><div><h1>图灵机实验台</h1><p>单纸带 · 确定性 · 可编程</p></div></div>
      <div class="toolbar">
        <button id="exportProject">导出项目</button>
        <button id="importProject">导入项目</button>
        <input id="fileInput" type="file" accept="application/json,.json" hidden />
        <button id="exportLog">导出记录</button>
      </div>
    </header>
    <main class="workspace">
      <section class="panel machine-panel">
        <div class="status-row">
          <div class="metric"><span>运行状态</span><strong id="status" class="status-pill">就绪</strong></div>
          <div class="metric"><span>当前状态</span><strong id="currentState">—</strong></div>
          <div class="metric"><span>读取符号</span><strong id="readSymbol">—</strong></div>
          <div class="metric"><span>读写头位置</span><strong id="headPosition">0</strong></div>
          <div class="metric"><span>已执行步数</span><strong id="stepCount">0</strong></div>
        </div>
        <div class="tape-shell"><div id="tape" class="tape"></div><div id="headState" class="head-state"></div></div>
        <div class="controls">
          <button id="step" class="btn">单步</button>
          <button id="run" class="btn primary">运行</button>
          <button id="pause" class="btn">暂停</button>
          <button id="reset" class="btn">重置</button>
          <div class="speed"><span>速度</span><input id="speed" type="range" min="1" max="10" value="5" /><span id="speedText">5</span></div>
        </div>
      </section>
      <div class="lower">
        <section class="panel editor">
          <div class="panel-title"><h2>机器定义</h2><small>每行一条规则：状态,符号 → 状态,符号,方向</small></div>
          <div class="form-grid">
            <label>初始输入<input id="input" /></label>
            <label>空白符<input id="blankSymbol" maxlength="2" /></label>
            <label>初始状态<input id="initialState" /></label>
            <label>最大步数<input id="maxSteps" type="number" min="1" max="1000000" /></label>
            <label>接受状态<input id="acceptStates" placeholder="逗号分隔" /></label>
            <label>拒绝状态<input id="rejectStates" placeholder="逗号分隔" /></label>
            <label>普通停机状态<input id="haltStates" placeholder="逗号分隔" /></label>
          </div>
          <label>转移规则<textarea id="rules" spellcheck="false"></textarea></label>
          <div class="table-heading"><strong>结构化规则表</strong><button id="addRule" class="btn">＋ 新增规则</button></div>
          <div id="ruleTable" class="rule-table"></div>
          <div class="editor-actions"><button id="apply" class="btn primary">应用并重置</button><button id="clear" class="btn danger">清空规则</button><span id="errors" class="error"></span></div>
          <div class="hint">快捷键：空格运行/暂停，Alt + → 单步，Ctrl + R 重置（输入框聚焦时不触发）。</div>
        </section>
        <aside class="side">
          <section class="panel">
            <div class="panel-title"><h2>示例程序</h2></div>
            <select id="example" style="width:100%">
              ${Object.entries(examples).map(([key, item]) => `<option value="${key}">${item.name}</option>`).join("")}
            </select>
            <p id="exampleNote" class="example-note"></p>
            <button id="loadExample" class="btn" style="width:100%">加载此示例</button>
          </section>
          <section class="panel">
            <div class="panel-title"><h2>执行记录</h2><small id="stopMessage"></small></div>
            <div id="log" class="log"></div>
          </section>
        </aside>
      </div>
    </main>
  </div>`;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const value = (id: string) => byId<HTMLInputElement | HTMLTextAreaElement>(id).value;
const splitStates = (raw: string) => raw.split(",").map((item) => item.trim()).filter(Boolean);

function collectProject(): ProjectData {
  return {
    format: "turing-machine-simulator",
    version: 1,
    name: "自定义图灵机",
    description: "用户编辑的图灵机项目",
    input: value("input"),
    blankSymbol: value("blankSymbol") || "□",
    initialState: value("initialState"),
    acceptStates: value("acceptStates"),
    rejectStates: value("rejectStates"),
    haltStates: value("haltStates"),
    rules: value("rules"),
    maxSteps: Number(value("maxSteps")) || 10000,
    speed: Number(value("speed")) || 5,
  };
}

function fillProject(project: ProjectData | ExampleProject): void {
  const fields = ["input", "blankSymbol", "initialState", "acceptStates", "rejectStates", "haltStates", "rules"] as const;
  for (const field of fields) byId<HTMLInputElement | HTMLTextAreaElement>(field).value = project[field];
  if ("maxSteps" in project) byId<HTMLInputElement>("maxSteps").value = String(project.maxSteps);
  else byId<HTMLInputElement>("maxSteps").value = "10000";
  if ("speed" in project) byId<HTMLInputElement>("speed").value = String(project.speed);
  updateSpeedText();
}

function createMachine(): boolean {
  pause();
  const project = collectProject();
  const parsed = parseTransitions(project.rules);
  const errors = [...parsed.errors];
  if (!project.initialState.trim()) errors.unshift("初始状态不能为空");
  if (!project.blankSymbol) errors.unshift("空白符不能为空");
  if (Array.from(project.blankSymbol).length !== 1) errors.unshift("空白符必须是一个字符");
  byId("errors").textContent = errors.slice(0, 4).join("；");
  if (errors.length) return false;
  const definition: MachineDefinition = {
    blankSymbol: project.blankSymbol,
    initialState: project.initialState.trim(),
    acceptStates: splitStates(project.acceptStates),
    rejectStates: splitStates(project.rejectStates),
    haltStates: splitStates(project.haltStates),
    transitions: parsed.transitions,
  };
  try {
    machine = new TuringMachine(definition, inputToTape(project.input, project.blankSymbol));
  } catch (error) {
    byId("errors").textContent = error instanceof Error ? error.message : "无法创建机器";
    return false;
  }
  records = [];
  status = "就绪";
  stopMessage = "";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  render();
  renderRuleTable();
  return true;
}

function renderTape(): void {
  const tape = byId("tape");
  tape.replaceChildren();
  const head = machine?.headPosition ?? 0;
  for (let position = head - 8; position <= head + 8; position += 1) {
    const cell = document.createElement("div");
    cell.className = `cell${position === head ? " head" : ""}`;
    cell.innerHTML = `<span class="cell-index">${position}</span>`;
    const symbol = document.createElement("span");
    symbol.textContent = machine?.tape.read(position) ?? value("blankSymbol") ?? "□";
    cell.append(symbol);
    tape.append(cell);
  }
}

function renderLog(): void {
  const log = byId("log");
  if (!records.length) {
    log.innerHTML = `<div class="empty">单步或运行后，这里会显示执行过程</div>`;
    return;
  }
  log.innerHTML = records.slice(-120).reverse().map((record) => `
    <div class="log-row"><span>#${record.step}</span><span>${record.fromState},${record.readSymbol} → ${record.toState},${record.writeSymbol},${record.direction}　[${record.headBefore}→${record.headAfter}]</span></div>`).join("");
}

function serializeRuleRows(): void {
  const rows = [...document.querySelectorAll<HTMLElement>(".rule-data-row")];
  byId<HTMLTextAreaElement>("rules").value = rows.map((row) => {
    const fields = [...row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")].map((field) => field.value.trim());
    return `${fields[0]},${fields[1]} -> ${fields[2]},${fields[3]},${fields[4]}`;
  }).join("\n");
}

function renderRuleTable(): void {
  const host = byId("ruleTable");
  const parsed = parseTransitions(value("rules"));
  if (parsed.errors.length) {
    host.innerHTML = `<div class="empty">修正文本规则后即可同步结构化表格</div>`;
    return;
  }
  host.innerHTML = `<div class="rule-row rule-head"><span>当前状态</span><span>读取</span><span>下一状态</span><span>写入</span><span>移动</span><span></span></div>` +
    parsed.transitions.map((rule, index) => `<div class="rule-row rule-data-row" data-index="${index}">
      <input aria-label="规则 ${index + 1} 当前状态" value="${escapeAttribute(rule.fromState)}" />
      <input aria-label="规则 ${index + 1} 读取符号" value="${escapeAttribute(rule.readSymbol)}" />
      <input aria-label="规则 ${index + 1} 下一状态" value="${escapeAttribute(rule.toState)}" />
      <input aria-label="规则 ${index + 1} 写入符号" value="${escapeAttribute(rule.writeSymbol)}" />
      <select aria-label="规则 ${index + 1} 移动方向"><option${rule.direction === "L" ? " selected" : ""}>L</option><option${rule.direction === "R" ? " selected" : ""}>R</option><option${rule.direction === "N" ? " selected" : ""}>N</option></select>
      <button class="delete-rule" aria-label="删除规则 ${index + 1}">×</button>
    </div>`).join("");
  host.querySelectorAll("input,select").forEach((field) => field.addEventListener("change", () => { serializeRuleRows(); createMachine(); }));
  host.querySelectorAll<HTMLButtonElement>(".delete-rule").forEach((button) => button.addEventListener("click", () => {
    button.closest(".rule-data-row")?.remove();
    serializeRuleRows();
    createMachine();
  }));
}

function escapeAttribute(raw: string): string {
  return raw.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function render(): void {
  byId("status").textContent = status;
  byId("currentState").textContent = machine?.currentState ?? "—";
  byId("readSymbol").textContent = machine?.tape.read(machine.headPosition) ?? "—";
  byId("headPosition").textContent = String(machine?.headPosition ?? 0);
  byId("stepCount").textContent = String(machine?.stepCount ?? 0);
  byId("headState").textContent = machine ? `读写头 · ${machine.currentState}` : "";
  byId("stopMessage").textContent = stopMessage;
  renderTape();
  renderLog();
}

const reasonText = { accept: "接受", reject: "拒绝", halt: "已停机", "missing-transition": "缺少转移规则" } as const;

function singleStep(): boolean {
  if (!machine && !createMachine()) return false;
  const maxSteps = Number(value("maxSteps")) || 10000;
  if (machine!.stepCount >= maxSteps) {
    status = "达到步数限制";
    stopMessage = `已暂停在 ${maxSteps} 步`;
    pause(false);
    render();
    return false;
  }
  const result = machine!.step();
  if (result.record) {
    records.push(result.record);
    if (records.length > 5000) records.shift();
  }
  if (result.stopped) {
    status = reasonText[result.reason!];
    stopMessage = result.reason === "missing-transition" ? `状态 ${machine!.currentState} 读取 ${machine!.tape.read(machine!.headPosition)} 时无规则` : reasonText[result.reason!];
    pause(false);
  } else status = timer ? "运行中" : "已暂停";
  render();
  return !result.stopped;
}

function run(): void {
  if (timer) return;
  if (!machine && !createMachine()) return;
  status = "运行中";
  const speed = Number(value("speed"));
  const delay = Math.max(16, 1050 - speed * 103);
  timer = window.setInterval(() => singleStep(), delay);
  render();
}

function pause(changeStatus = true): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (changeStatus && machine && status === "运行中") status = "已暂停";
  render();
}

function updateSpeedText(): void {
  byId("speedText").textContent = value("speed");
  if (timer) { pause(false); run(); }
}

function download(name: string, content: string, type: string): void {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([content], { type }));
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

byId("apply").addEventListener("click", createMachine);
byId("step").addEventListener("click", () => { pause(false); singleStep(); });
byId("run").addEventListener("click", run);
byId("pause").addEventListener("click", () => pause());
byId("reset").addEventListener("click", createMachine);
byId("speed").addEventListener("input", updateSpeedText);
byId("clear").addEventListener("click", () => { pause(); byId<HTMLTextAreaElement>("rules").value = ""; });
byId("addRule").addEventListener("click", () => {
  const source = value("rules").trim();
  byId<HTMLTextAreaElement>("rules").value = `${source}${source ? "\n" : ""}q0,□ -> HALT,□,N`;
  renderRuleTable();
});
byId("rules").addEventListener("input", renderRuleTable);
byId("example").addEventListener("change", () => {
  byId("exampleNote").textContent = examples[value("example")].description;
});
byId("loadExample").addEventListener("click", () => {
  const example = examples[value("example")];
  fillProject(example);
  createMachine();
  byId("exampleNote").textContent = example.description;
});
byId("exportProject").addEventListener("click", () => download("turing-machine-project.json", JSON.stringify(collectProject(), null, 2), "application/json"));
byId("importProject").addEventListener("click", () => byId<HTMLInputElement>("fileInput").click());
byId("fileInput").addEventListener("change", async () => {
  const file = byId<HTMLInputElement>("fileInput").files?.[0];
  if (!file || file.size > 5_000_000) return;
  try {
    const project = JSON.parse(await file.text()) as ProjectData;
    if (project.format !== "turing-machine-simulator" || project.version !== 1) throw new Error();
    fillProject(project);
    createMachine();
  } catch { byId("errors").textContent = "项目文件无效或版本不兼容"; }
});
byId("exportLog").addEventListener("click", () => {
  const header = "step,from,read,to,write,direction,headBefore,headAfter";
  const rows = records.map((r) => [r.step,r.fromState,r.readSymbol,r.toState,r.writeSymbol,r.direction,r.headBefore,r.headAfter].map((x) => JSON.stringify(x)).join(","));
  download("turing-machine-log.csv", [header, ...rows].join("\n"), "text/csv");
});
document.addEventListener("keydown", (event) => {
  const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
  if (editing) return;
  if (event.code === "Space") { event.preventDefault(); timer ? pause() : run(); }
  if (event.altKey && event.code === "ArrowRight") { event.preventDefault(); pause(false); singleStep(); }
  if (event.ctrlKey && event.code === "KeyR") { event.preventDefault(); createMachine(); }
});

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as ProjectData | null;
  fillProject(saved?.format === "turing-machine-simulator" ? saved : defaultProject);
} catch { fillProject(defaultProject); }
byId("exampleNote").textContent = examples.unary.description;
createMachine();
renderRuleTable();
