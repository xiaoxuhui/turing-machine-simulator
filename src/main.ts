import "./styles.css";
import { effectiveTapeScroll, inputToTape, isHeadInWindow, parseTransitions, tapeWindowCenter, TuringMachine, type MachineDefinition, type StepRecord, type TapeViewMode } from "./core";
import { examples, type ExampleProject } from "./examples";
import { machineProjectKey, shouldApplyCurrentDraft } from "./project-state";
import { buildTilePuzzle, isSolved, tileFits, type TilePuzzle } from "./tile-puzzle";
import { attachTapeDrag } from "./tape-drag";
import { normalizeRouteSteps, routeCanvasSize, routeSampleIndex } from "./route-view";
import { normalizeSpeed } from "./speed";
import { ExecutionScheduler } from "./execution-scheduler";
import { RouteController, type RouteFrame } from "./route-controller";
import { renderExecutionLog } from "./execution-log";
import { loadProject, parseProjectJson, saveProject, type ProjectData } from "./project-codec";
import { shuffled } from "./shuffle";

const STORAGE_KEY = "turing-machine-simulator.project.v1";
let machine: TuringMachine | null = null;
let records: StepRecord[] = [];
let status = "就绪";
let stopMessage = "";
let appliedMachineKey: string | null = null;
let tilePuzzle: TilePuzzle | null = null;
let placedTiles: Array<string | null> = [];
let selectedTileId: string | null = null;
let solutionVisible = false;
let tileOrder: string[] = [];
let tapeScroll = 0;

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
          <label class="view-mode">纸带视角<select id="tapeViewMode"><option value="follow-head">跟随读写头</option><option value="fixed-zero">固定在 0</option><option value="free-drag">随意拖动</option></select></label>
          <div class="speed"><span>目标速度</span><input id="speed" type="range" min="1" max="1000" value="5" /><span id="speedText">5 步/秒</span><strong id="actualSpeed">实际 0 步/秒</strong></div>
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
      <section class="panel route-panel">
        <div class="route-heading">
          <div><h2>全路线总览</h2><p>后台计算整段运行轨迹并压缩成一张时空图；生成时仍可继续使用上面的模拟器和瓷砖游戏。</p></div>
          <div class="route-actions"><label>运行步数<input id="routeSteps" type="number" min="1" step="1" value="10000" /></label><button id="generateRoute" class="btn primary">后台生成</button><button id="cancelRoute" class="btn" disabled>取消</button></div>
        </div>
        <div class="route-progress"><progress id="routeProgress" max="100" value="0"></progress><span id="routeStatus">等待生成</span></div>
        <div class="route-legend"><span class="legend-head"></span>读写头 <span class="legend-written"></span>非空纸带 <span class="legend-empty"></span>空白；纵向为时间，横向为纸带位置</div>
        <div class="route-canvas-shell"><canvas id="routeCanvas" width="900" height="260"></canvas><div id="routeEmpty">输入步数后点击“后台生成”</div></div>
      </section>
      <section class="panel puzzle-panel">
        <div class="puzzle-heading">
          <div><h2>计算瓷砖拼图</h2><p>每一行是一个时刻；相邻边必须同色。点击或拖动瓷砖，把它放入上方空格。</p></div>
          <div class="puzzle-actions"><label>生成步数<input id="puzzleSteps" type="number" min="1" max="30" value="10" /></label><button id="generatePuzzle" class="btn primary">生成瓷砖</button><button id="checkPuzzle" class="btn">检查拼法</button><button id="showSolution" class="btn">查看正确拼法</button></div>
        </div>
        <div id="cycleInfo" class="cycle-info">应用一台图灵机后生成瓷砖。</div>
        <div class="puzzle-scroll"><div id="puzzleBoard" class="puzzle-board"></div></div>
        <h3 class="tray-title">待拼瓷砖 <small>点击一块，再点击空格；也支持拖放</small></h3>
        <div id="tileTray" class="tile-tray"></div>
        <div id="puzzleMessage" class="puzzle-message" aria-live="polite"></div>
      </section>
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
  tapeScroll = 0;
  appliedMachineKey = machineProjectKey(project);
  status = "就绪";
  stopMessage = "";
  const storageError = saveProject(localStorage, STORAGE_KEY, project);
  if (storageError) byId("errors").textContent = storageError;
  render();
  renderRuleTable();
  generatePuzzle();
  return true;
}

function edgeColor(edge: string): string {
  let hash = 0;
  for (const char of edge) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 62% 48%)`;
}

function tileMarkup(tileId: string): string {
  const tile = tilePuzzle?.tiles.find((item) => item.id === tileId);
  if (!tile) return "";
  const label = tile.state ? `${tile.state} · ${tile.symbol}` : tile.symbol;
  return `<div class="wang-tile${tile.state ? " head-tile" : ""}" draggable="true" data-tile-id="${tile.id}" title="${escapeAttribute(label)}">
    <i class="edge edge-top" style="background:${edgeColor(tile.top)}"></i><i class="edge edge-right" style="background:${edgeColor(tile.right)}"></i>
    <i class="edge edge-bottom" style="background:${edgeColor(tile.bottom)}"></i><i class="edge edge-left" style="background:${edgeColor(tile.left)}"></i>
    <span>${tile.state ? `<b>${escapeAttribute(tile.state)}</b>` : ""}${escapeAttribute(tile.symbol)}</span></div>`;
}

function renderPuzzle(): void {
  const board = byId("puzzleBoard");
  const tray = byId("tileTray");
  if (!tilePuzzle) { board.innerHTML = ""; tray.innerHTML = ""; return; }
  board.style.gridTemplateColumns = `repeat(${tilePuzzle.columns}, 62px)`;
  board.innerHTML = placedTiles.map((tileId, slot) => `<button class="tile-slot${solutionVisible ? " solution-slot" : ""}" data-slot="${slot}" aria-label="第 ${Math.floor(slot / tilePuzzle!.columns) + 1} 行第 ${slot % tilePuzzle!.columns + 1} 列">${tileId ? tileMarkup(tileId) : `<span>${slot % tilePuzzle!.columns + tilePuzzle!.minPosition}</span>`}</button>`).join("");
  const remaining = tileOrder.map((id) => tilePuzzle!.tiles.find((tile) => tile.id === id)!).filter((tile) => !placedTiles.includes(tile.id));
  tray.innerHTML = remaining.map((tile) => `<button class="tray-tile${selectedTileId === tile.id ? " selected" : ""}" data-select-tile="${tile.id}">${tileMarkup(tile.id)}</button>`).join("") || `<div class="empty">所有瓷砖都已放到棋盘</div>`;
}

function placeTile(slot: number, tileId: string): void {
  if (!tilePuzzle || solutionVisible) return;
  const old = placedTiles[slot];
  if (!tileFits(tilePuzzle, placedTiles, slot, tileId)) {
    byId("puzzleMessage").textContent = "这块瓷砖与已放置的相邻边不匹配，或已经使用过。";
    return;
  }
  if (old) placedTiles[slot] = null;
  placedTiles[slot] = tileId;
  selectedTileId = null;
  byId("puzzleMessage").textContent = isSolved(tilePuzzle, placedTiles) ? "完成！这张铺法逐行复现了图灵机的计算历史。" : "已放置。";
  renderPuzzle();
}

function generatePuzzle(): void {
  if (!machine) return;
  const steps = Math.min(30, Math.max(1, Number(value("puzzleSteps")) || 10));
  tilePuzzle = buildTilePuzzle(machine.definition, inputToTape(value("input"), machine.definition.blankSymbol), steps, 1);
  placedTiles = Array(tilePuzzle.solution.length).fill(null);
  selectedTileId = null;
  solutionVisible = false;
  tileOrder = shuffled(tilePuzzle.solution);
  const loopText = tilePuzzle.loop ? `发现循环：从第 ${tilePuzzle.loop.start} 步开始，周期 ${tilePuzzle.loop.length} 步。` : `未发现循环；计算结果：${reasonText[tilePuzzle.stopReason as keyof typeof reasonText] ?? `到达 ${steps} 步上限`}。`;
  byId("cycleInfo").textContent = `${loopText} 棋盘 ${tilePuzzle.rows} × ${tilePuzzle.columns}，共 ${tilePuzzle.tiles.length} 块。`;
  byId("showSolution").textContent = "查看正确拼法";
  byId("puzzleMessage").textContent = "瓷砖已打乱。先找带状态名的读写头瓷砖。";
  renderPuzzle();
}

function drawRoute(frames: RouteFrame[], min: number, max: number): void {
  const canvas = byId<HTMLCanvasElement>("routeCanvas");
  const positions = max - min + 1;
  const size = routeCanvasSize(frames.length, positions);
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f4f7fa"; context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const frame = frames[routeSampleIndex(y, canvas.height, frames.length)];
    const occupied = new Set(frame.cells.map(([position]) => position));
    for (let x = 0; x < canvas.width; x += 1) {
      const position = min + routeSampleIndex(x, canvas.width, positions);
      if (position === frame.head) context.fillStyle = "#ef476f";
      else if (occupied.has(position)) context.fillStyle = "#168963";
      else continue;
      context.fillRect(x, y, 1, 1);
    }
  }
  byId("routeEmpty").hidden = true;
}

const routeController = new RouteController(
  () => new Worker(new URL("./route-worker.ts", import.meta.url), { type: "module" }),
  {
    onStart: (maxSteps) => {
      byId<HTMLButtonElement>("generateRoute").disabled = true;
      byId<HTMLButtonElement>("cancelRoute").disabled = false;
      byId<HTMLProgressElement>("routeProgress").value = 0;
      byId("routeStatus").textContent = `后台计算中：0 / ${maxSteps} 步`;
    },
    onProgress: (step, maxSteps) => {
      byId<HTMLProgressElement>("routeProgress").value = step / maxSteps * 100;
      byId("routeStatus").textContent = `后台计算中：${step} / ${maxSteps} 步（你可以继续玩）`;
    },
    onComplete: ({ frames, min, max, reason }) => {
      drawRoute(frames, min, max);
      byId<HTMLProgressElement>("routeProgress").value = 100;
      byId("routeStatus").textContent = `已显示 ${frames.length} 个时刻，纸带位置 ${min}…${max}，结束原因：${reasonText[reason as keyof typeof reasonText] ?? "达到步数上限"}`;
      byId<HTMLButtonElement>("generateRoute").disabled = false;
      byId<HTMLButtonElement>("cancelRoute").disabled = true;
    },
    onError: (message) => {
      byId("routeStatus").textContent = `后台生成失败：${message}`;
      byId<HTMLButtonElement>("generateRoute").disabled = false;
      byId<HTMLButtonElement>("cancelRoute").disabled = true;
    },
    onCancel: () => {
      byId<HTMLButtonElement>("generateRoute").disabled = false;
      byId<HTMLButtonElement>("cancelRoute").disabled = true;
      byId("routeStatus").textContent = "后台生成已取消；当前模拟器状态不受影响。";
    },
  },
);

function generateRoute(): void {
  if (!machine) return;
  const maxSteps = normalizeRouteSteps(Number(value("routeSteps")));
  byId<HTMLInputElement>("routeSteps").value = String(maxSteps);
  routeController.start({ definition: machine.definition, initialTape: inputToTape(value("input"), machine.definition.blankSymbol), maxSteps });
}

function renderTape(): void {
  const tape = byId("tape");
  tape.replaceChildren();
  const head = machine?.headPosition ?? 0;
  const mode = value("tapeViewMode") as TapeViewMode;
  // 仅「随意拖动」模式下拖动平移才生效；其它模式 tapeScroll 视为 0（删除原跨模式拖动）。
  const center = tapeWindowCenter(mode, head) + effectiveTapeScroll(mode, tapeScroll);
  // 抓手光标只在「随意拖动」模式下出现。
  tape.classList.toggle("can-drag", mode === "free-drag");
  for (let position = center - 8; position <= center + 8; position += 1) {
    const cell = document.createElement("div");
    cell.className = `cell${position === head ? " head" : ""}`;
    cell.innerHTML = `<span class="cell-index">${position}</span>`;
    const symbol = document.createElement("span");
    symbol.textContent = machine?.tape.read(position) ?? value("blankSymbol") ?? "□";
    cell.append(symbol);
    tape.append(cell);
  }
  // 读写头移出可视窗口时，在边缘显示指示箭头，避免“拖远了就找不到光标”。
  if (!isHeadInWindow(center, head)) {
    const hint = document.createElement("div");
    const onLeft = head < center;
    hint.className = `head-offscreen ${onLeft ? "left" : "right"}`;
    hint.textContent = onLeft ? `← 读写头在 ${head}` : `读写头在 ${head} →`;
    tape.append(hint);
  }
}

function tapeCellPitch(): number {
  const cells = byId("tape").querySelectorAll<HTMLElement>(".cell");
  if (cells.length >= 2) {
    const pitch = Math.abs(cells[1].getBoundingClientRect().left - cells[0].getBoundingClientRect().left);
    if (pitch > 0) return pitch;
  }
  return 58;
}

function renderLog(): void {
  renderExecutionLog(byId("log"), records);
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
  const viewMode = value("tapeViewMode") as TapeViewMode;
  const headOutside = viewMode === "fixed-zero" && machine && Math.abs(machine.headPosition) > 8;
  const headDirection = machine && machine.headPosition < -8 ? "←" : "→";
  byId("headState").textContent = machine ? (headOutside ? `${headDirection} 读写头在 ${machine.headPosition} · ${machine.currentState}` : `读写头 · ${machine.currentState}`) : "";
  byId("stopMessage").textContent = stopMessage;
  renderTape();
  renderLog();
}

const reasonText = { accept: "接受", reject: "拒绝", halt: "已停机", "missing-transition": "缺少转移规则" } as const;

function ensureCurrentDraftApplied(): boolean {
  const currentProject = collectProject();
  if (shouldApplyCurrentDraft(Boolean(machine), appliedMachineKey, machineProjectKey(currentProject))) {
    return createMachine();
  }
  return true;
}

function singleStep(applyDraft = true, renderAfter = true): boolean {
  if (applyDraft && !ensureCurrentDraftApplied()) return false;
  if (!machine) return false;
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
  } else status = scheduler.running ? "运行中" : "已暂停";
  if (renderAfter || result.stopped) render();
  return !result.stopped;
}

const scheduler = new ExecutionScheduler({
  getTargetSpeed: () => Number(value("speed")),
  executeBatch: (maxSteps) => {
    const before = machine?.stepCount ?? 0;
    let remaining = maxSteps;
    let keepRunning = true;
    while (remaining-- > 0 && keepRunning) keepRunning = singleStep(false, false);
    return { executed: (machine?.stepCount ?? before) - before, keepRunning };
  },
  onTick: (actual) => {
    byId("actualSpeed").textContent = `实际 ${actual.toFixed(actual < 10 ? 1 : 0)} 步/秒`;
    render();
  },
});

function run(): void {
  if (scheduler.running) return;
  if (!ensureCurrentDraftApplied()) return;
  status = "运行中";
  scheduler.start();
  render();
}

function pause(changeStatus = true): void {
  scheduler.stop();
  if (changeStatus && machine && status === "运行中") status = "已暂停";
  render();
}

function resetMachine(): void {
  pause(false);
  if (!machine) {
    createMachine();
    return;
  }
  machine.reset();
  records = [];
  tapeScroll = 0;
  status = "就绪";
  stopMessage = "";
  byId("errors").textContent = "";
  render();
}

function updateSpeedText(): void {
  const speed = normalizeSpeed(Number(value("speed")));
  byId<HTMLInputElement>("speed").value = String(speed);
  byId("speedText").textContent = `${speed} 步/秒`;
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
byId("reset").addEventListener("click", resetMachine);
byId("speed").addEventListener("input", updateSpeedText);
byId("tapeViewMode").addEventListener("change", () => {
  tapeScroll = 0; // 切换视角归零，避免跨模式串扰
  byId("tape").style.transform = ""; // 清除可能的亚格 transform 残留
  render();
});
attachTapeDrag(byId("tape"), {
  getScroll: () => tapeScroll,
  setScroll: (newValue) => {
    // 仅「随意拖动」模式下允许拖动；其它视角忽略（删除原跨模式拖动）。
    if (value("tapeViewMode") !== "free-drag") return;
    if (newValue === tapeScroll) return; // 同值不重渲染，减少亚格拖动时的闪烁
    tapeScroll = newValue;
    renderTape();
  },
  getPitch: tapeCellPitch,
  // 平滑跟手：把亚格余数作为 transform 施加到纸带，松手时传 0 吸附回整格。
  applyShift: (pixelOffset) => {
    byId("tape").style.transform = pixelOffset === 0 ? "" : `translateX(${pixelOffset}px)`;
  },
  isEnabled: () => value("tapeViewMode") === "free-drag",
});
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
    const project = parseProjectJson(await file.text());
    fillProject(project);
    createMachine();
  } catch (error) {
    byId("errors").textContent = error instanceof Error ? `项目文件无效：${error.message}` : "项目文件无效或版本不兼容";
  }
});
byId("exportLog").addEventListener("click", () => {
  const header = "step,from,read,to,write,direction,headBefore,headAfter";
  const rows = records.map((r) => [r.step,r.fromState,r.readSymbol,r.toState,r.writeSymbol,r.direction,r.headBefore,r.headAfter].map((x) => JSON.stringify(x)).join(","));
  download("turing-machine-log.csv", [header, ...rows].join("\n"), "text/csv");
});
byId("generatePuzzle").addEventListener("click", generatePuzzle);
byId("generateRoute").addEventListener("click", generateRoute);
byId("cancelRoute").addEventListener("click", () => {
  routeController.cancel();
});
byId("checkPuzzle").addEventListener("click", () => {
  if (!tilePuzzle) return;
  const filled = placedTiles.filter(Boolean).length;
  byId("puzzleMessage").textContent = isSolved(tilePuzzle, placedTiles)
    ? "完全正确！每一行都对应图灵机的一步计算。"
    : `已放 ${filled}/${placedTiles.length} 块；${filled === placedTiles.length ? "铺法不正确，请调整。" : "继续把剩余瓷砖拼入棋盘。"}`;
});
byId("showSolution").addEventListener("click", () => {
  if (!tilePuzzle) return;
  solutionVisible = !solutionVisible;
  placedTiles = solutionVisible ? [...tilePuzzle.solution] : Array(tilePuzzle.solution.length).fill(null);
  selectedTileId = null;
  byId("showSolution").textContent = solutionVisible ? "返回自己拼" : "查看正确拼法";
  byId("puzzleMessage").textContent = solutionVisible ? "正确拼法已显示：从上到下是计算时间，从左到右是纸带位置。" : "答案已收起，棋盘已清空。";
  renderPuzzle();
});
byId("tileTray").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-select-tile]");
  if (!target || solutionVisible) return;
  selectedTileId = target.dataset.selectTile!;
  byId("puzzleMessage").textContent = "已选中瓷砖，请点击棋盘中的空格。";
  renderPuzzle();
});
byId("puzzleBoard").addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
  if (!target || solutionVisible) return;
  const slot = Number(target.dataset.slot);
  if (selectedTileId) placeTile(slot, selectedTileId);
  else if (placedTiles[slot]) { placedTiles[slot] = null; renderPuzzle(); }
});
document.addEventListener("dragstart", (event) => {
  const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-tile-id]");
  if (tile && event.dataTransfer) event.dataTransfer.setData("text/plain", tile.dataset.tileId!);
});
byId("puzzleBoard").addEventListener("dragover", (event) => event.preventDefault());
byId("puzzleBoard").addEventListener("drop", (event) => {
  event.preventDefault();
  const slot = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
  const tileId = event.dataTransfer?.getData("text/plain");
  if (slot && tileId) placeTile(Number(slot.dataset.slot), tileId);
});
document.addEventListener("keydown", (event) => {
  const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement;
  if (editing) return;
  if (event.code === "Space") { event.preventDefault(); scheduler.running ? pause() : run(); }
  if (event.altKey && event.code === "ArrowRight") { event.preventDefault(); pause(false); singleStep(); }
  if (event.ctrlKey && event.code === "KeyR") { event.preventDefault(); resetMachine(); }
});

fillProject(loadProject(localStorage, STORAGE_KEY) ?? defaultProject);
byId("exampleNote").textContent = examples.unary.description;
createMachine();
renderRuleTable();
