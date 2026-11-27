import "./life-styles.css";
import { emptyLife, lifeBounds, type LifePattern, type LifePoint, type LifePort, type LifeReading, type LifeShape } from "./life";
import { lifeJSON, lifeRLE, parseLife, shapeLabel, validateLife } from "./life-format";
import { lifePresets } from "./life-presets";
import { requestDownload } from "./download";
import type { LifeRequest, LifeResponse } from "./life-worker";
import { readLifeMachine } from "./life-machine";
import { editorFields, loadEditorDraft } from "./editor-draft";
import { loadProject, parseProjectJson } from "./project-codec";
import type { MachineProjectFields } from "./project-state";
import { readLifeSession, writeLifeSession } from "./life-storage";

const STORAGE = "turing-machine-simulator.conway-life.v1";
document.querySelector<HTMLDivElement>("#life-app")!.innerHTML = `
  <header class="life-header"><div><h1>康威生命游戏 <span>B3/S23</span></h1><p>八个邻居 · 同步更新 · 无限平面</p></div><nav><a href="./">图灵机实验台</a><a href="./rule110.html">规则 110</a></nav></header>
  <section class="life-controls" aria-label="演化控制">
    <div class="control-row"><button id="life-run" class="primary">运行</button><button id="life-step">单步</button><div class="inline-field"><label for="life-amount">前进</label><input id="life-amount" type="number" min="1" step="1" value="100" aria-label="前进代数" /><button id="life-advance">代</button></div><button id="life-cancel" hidden>取消前进</button><button id="life-reset">重置</button><button id="life-undo" disabled>撤销编辑</button><button id="life-clear">清空</button><div class="speed-control"><label for="life-speed">目标速度</label><input id="life-speed" type="number" min="1" max="1000" value="20" /><span>代/秒</span></div><span id="life-actual">实际 0 代/秒</span></div>
    <div class="control-row"><label class="sr-only" for="life-tool">画布工具</label><select id="life-tool"><option value="draw">绘制</option><option value="erase">擦除</option><option value="pan">拖动画布</option><option value="input">放置输入</option><option value="output">放置输出</option></select><label class="sr-only" for="life-shape">端口类型</label><select id="life-shape" hidden></select><button id="life-zoom-out" aria-label="缩小">−</button><button id="life-zoom-in" aria-label="放大">＋</button><button id="life-fit">显示全部</button><button id="life-origin">回到原点</button><div class="preset-control"><label class="sr-only" for="life-preset">图案示例</label><select id="life-preset">${Object.entries(lifePresets).map(([id, p]) => `<option value="${id}">${p.name}</option>`).join("")}</select><button id="life-load-preset">载入图案</button></div><button id="life-import">导入</button><button id="life-export">导出 RLE</button><button id="life-save">保存 JSON</button></div>
  </section>
  <main class="life-workspace">
    <section class="board-panel" aria-label="生命游戏画布"><div class="board-metrics"><span>第 <strong id="life-generation">0</strong> 代</span><span>活细胞 <strong id="life-population">0</strong></span><span id="life-position">坐标 (0, 0)</span><span id="life-zoom">100%</span></div><div class="canvas-host"><canvas id="life-board" tabindex="0" aria-label="生命游戏画布，点击绘制，滚轮缩放，拖动工具平移"></canvas><span class="canvas-help">滚轮缩放 · 中键 / 空格拖动 · 触屏双指缩放</span></div><p id="life-notice" role="status" aria-live="polite">准备就绪。</p></section>
    <aside class="life-sidebar"><section><h2>输入 <small>点击 0 / 1 切换</small></h2><div id="life-inputs" class="port-list"></div></section><section><h2>输出 <small>实际图案检测</small></h2><div id="life-outputs" class="port-list"></div><p id="life-reading" class="hint"></p></section><section class="life-explanation"><h2>玩法与规则</h2><p>死细胞周围恰有 <b>3</b> 个活邻居时出生；活细胞有 <b>2 或 3</b> 个活邻居时存活，其余死亡。</p><p>所有格子同时更新。没有边缘围墙，也不会把两端相连；屏幕外照常演化。</p><p id="life-preset-note">${lifePresets.glider.note}</p><details><summary>输入、输出与文件</summary><p>参考逻辑工坊：输入为食者开关，0 阻断信号，1 移除七格食者、让信号通过。也可以放置可切换的单格输入。</p><p>输出检测单格、滑翔机或轻型飞船的指定相位。导入逻辑工坊 RLE 时读取端口坐标和采样时序；等待信号传播后才显示采样值。</p><p>端口边框、名称和读数只是标记，不参与 B3/S23。删除端口只删除标记，图案仍保留。</p><p>支持粘贴 RLE、逐行 O/. 图案及本页 JSON；RLE 可用 Golly 打开，JSON 与自动存档保留当前代数、端口和重置起点。</p><a href="https://golly.sourceforge.io/Help/formats.html" target="_blank" rel="noopener noreferrer">Golly RLE 格式说明</a></details></section><p id="life-storage" class="hint" role="status">本页自动存档与实验台独立。</p></aside>
  </main>
  <dialog id="life-import-dialog"><form id="life-import-form"><div class="dialog-heading"><h2>导入生命游戏图案</h2><button type="button" id="life-close-import" aria-label="关闭导入">关闭</button></div><label for="life-source">粘贴 RLE、O/. 图案或本页 JSON</label><textarea id="life-source" rows="9" spellcheck="false" placeholder="x = 3, y = 3, rule = B3/S23&#10;bo$2bo$3o!"></textarea><p id="life-import-error" class="error" role="alert"></p><div class="control-row"><button type="button" id="life-choose-file">选择文件</button><button type="submit" class="primary">载入图案</button></div></form></dialog><input id="life-file" type="file" accept=".rle,.cells,.txt,.json,text/plain,application/json" hidden />`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const field = (id: string) => el<HTMLInputElement | HTMLSelectElement>(id).value;
const text = (id: string, value: string) => { el(id).textContent = value; };
const board = el<HTMLCanvasElement>("life-board"), context = board.getContext("2d")!;
const worker = new Worker(new URL("./life-worker.ts", import.meta.url), { type: "module" });
const convertButton = document.createElement("button"); convertButton.id = "life-convert-machine"; convertButton.textContent = "图灵机转换";
el("life-import").before(convertButton);
const machineStep = document.createElement("button"); machineStep.id = "life-machine-step"; machineStep.textContent = "图灵机一步"; machineStep.hidden = true; el("life-step").after(machineStep);
const machineRead = document.createElement("section"); machineRead.id = "life-machine-reading"; machineRead.hidden = true; el("life-outputs").closest("section")!.before(machineRead);
document.body.insertAdjacentHTML("beforeend", `<dialog id="life-machine-dialog"><form id="life-machine-form"><div class="dialog-heading"><h2>图灵机转换为生命游戏</h2><button type="button" id="life-machine-close">关闭</button></div><p>把规则编译成逻辑工坊同款逻辑门与反馈寄存器。转换后只按 B3/S23 演化；每个反馈周期对应图灵机一步。</p><div class="control-row"><button type="button" id="life-machine-read-lab">读取实验台草稿</button><button type="button" id="life-machine-import">导入图灵机项目</button><button type="button" id="life-machine-example">写入 1 示例</button></div><div class="machine-fields"><label class="wide">初始输入<input id="life-tm-input" /></label><label>空白符<input id="life-tm-blankSymbol" /></label><label>初始状态<input id="life-tm-initialState" /></label><label>停机状态<input id="life-tm-haltStates" /></label><label>接受状态<input id="life-tm-acceptStates" /></label><label>拒绝状态<input id="life-tm-rejectStates" /></label><label>纸带左端坐标<input id="life-tm-left" type="number" value="0" /></label><label>纸带右端坐标<input id="life-tm-right" type="number" value="0" /></label></div><label for="life-tm-rules">转移规则 / 函数源码</label><textarea id="life-tm-rules" rows="6" spellcheck="false"></textarea><p class="hint">范围需包含位置 0 和全部输入，最多 64 格。越界会点亮“空间不足”，不环绕、不当作停机；可扩大纸带重新转换。状态、符号和图案规模受浏览器内存预算限制。</p><p id="life-machine-progress" role="status"></p><p id="life-machine-error" class="error" role="alert"></p><div class="control-row"><button type="submit" id="life-machine-compile" class="primary">转换并载入生命游戏</button><button type="button" id="life-machine-cancel" hidden>取消转换</button></div><p class="hint">门图案：Myreen 与 Carneiro，<a href="https://doi.org/10.4230/LIPIcs.ITP.2025.25" target="_blank" rel="noopener noreferrer">CC BY 4.0，来源与论文</a>；布局复用逻辑工坊（MIT）。本转换器本身不属于论文证明的部分。</p></form></dialog><input id="life-machine-file" type="file" accept=".json,application/json" hidden />`);
let pattern = lifePresets.glider.make(), seed = structuredClone(pattern), reading: LifeReading | null = null;
let camera = { x: 1, y: 1, scale: 20 }, latest = 0, busy = false, running = false, advancing = false;
let undo: { pattern: LifePattern; seed: LifePattern } | undefined, storageTimer: ReturnType<typeof setTimeout> | undefined;
let lastTick = performance.now(), debt = 0, rateStart = performance.now(), rateGeneration = 0;
let fitAfterLoad = true, lastPortSignature = "", frame = 0, heldSpace = false;
let restoreCamera = false, storageReadable = true;
let saveRevision = 0;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
  if (saved) {
    pattern = validateLife(saved.pattern); seed = validateLife(saved.seed);
    if (saved.camera && [saved.camera.x, saved.camera.y, saved.camera.scale].every(Number.isFinite) && saved.camera.scale >= .01 && saved.camera.scale <= 64) { camera = saved.camera; fitAfterLoad = false; restoreCamera = true; }
    if (Number.isFinite(saved.speed)) el<HTMLInputElement>("life-speed").value = String(Math.max(1, Math.min(1000, saved.speed)));
    text("life-preset-note", "已恢复本页上次的图案、端口与重置起点。");
  }
} catch { storageReadable = false; text("life-storage", "旧存档未能读取，已保留原记录。载入图案或导入文件后可重新保存。"); }

type Command = LifeRequest extends infer R ? R extends LifeRequest ? Omit<R, "id"> : never : never;
function send(command: Command): void { busy = true; latest++; worker.postMessage({ ...command, id: latest }); controls(); }
function controls(): void {
  text("life-run", running ? "暂停" : "运行");
  el<HTMLButtonElement>("life-step").disabled = busy;
  el<HTMLButtonElement>("life-advance").disabled = busy;
  el("life-cancel").hidden = !advancing;
  el<HTMLButtonElement>("life-undo").disabled = !undo;
  machineStep.hidden = !pattern.machine; machineStep.disabled = busy;
}
function pause(): void {
  running = false; debt = 0; text("life-actual", "实际 0 代/秒");
  if (busy) send({ type: "cancel" });
  advancing = false; controls();
}
function markUndo(): void { undo = { pattern: structuredClone(pattern), seed: structuredClone(seed) }; controls(); }
function persist(): void {
  saveRevision++;
  if (storageReadable) text("life-storage", "正在保存当前图案与重置起点…");
  clearTimeout(storageTimer);
  storageTimer = setTimeout(saveNow, 800);
}
async function saveNow(): Promise<void> {
  if (!storageReadable) return;
  const revision = saveRevision, saved = { pattern, seed, camera: { ...camera }, speed: Number(field("life-speed")) };
  try { await writeLifeSession(saved); if (revision === saveRevision) text("life-storage", "当前图案与重置起点已自动保存在本浏览器。"); }
  catch {
    try { localStorage.setItem(STORAGE, JSON.stringify(saved)); text("life-storage", "当前图案已保存在本浏览器。"); }
    catch { text("life-storage", "自动保存失败，请用“保存 JSON”保留当前进度。"); }
  }
}
function load(next: LifePattern, initial = next, fitView = true): void {
  pause(); pattern = next; seed = structuredClone(initial); fitAfterLoad = fitView; reading = null; storageReadable = true;
  el("life-notice").classList.remove("error");
  rateStart = performance.now(); rateGeneration = next.generation;
  send({ type: "load", pattern: next, seed: initial });
}
worker.onmessage = ({ data }: MessageEvent<LifeResponse>) => {
  if (data.id !== latest) return;
  if (data.type === "error") {
    busy = false; running = false; advancing = false; text("life-notice", data.message); el("life-notice").classList.add("error"); controls(); return;
  }
  pattern = data.pattern; reading = data.reading; busy = !!data.remaining;
  if (advancing) {
    text("life-notice", data.remaining ? `后台演化中，已前进 ${data.completed?.toLocaleString()} 代；还剩 ${data.remaining.toLocaleString()} 代。可取消，也可继续移动视角。` : `前进完成，当前第 ${pattern.generation.toLocaleString()} 代。`);
    if (!busy) advancing = false;
  }
  const elapsed = performance.now() - rateStart;
  if (elapsed >= 500) { text("life-actual", `实际 ${((pattern.generation - rateGeneration) * 1000 / elapsed).toFixed(1)} 代/秒`); rateStart = performance.now(); rateGeneration = pattern.generation; }
  if (!running && !advancing && !busy) text("life-actual", "实际 0 代/秒");
  text("life-generation", pattern.generation.toLocaleString()); text("life-population", pattern.cells.length.toLocaleString());
  if (fitAfterLoad) { fitAfterLoad = false; fit(); }
  updatePorts(); renderSoon(); controls(); persist();
};
worker.onerror = () => { busy = false; running = false; advancing = false; controls(); text("life-notice", "后台演化发生错误，当前图案仍可导出；重新打开本页可恢复最近存档。"); };

function displayValue(port: LifePort): string { return port.kind === "input" ? String(port.value) : reading && port.id in reading.values ? String(reading.values[port.id]) : "—"; }
function locate(port: LifePort): void { camera.x = port.x + (port.shape === "glider" ? 11 : 1); camera.y = port.y + (port.shape === "glider" ? 11 : 1); camera.scale = 12; renderSoon(); persist(); }
function updatePorts(): void {
  const signature = JSON.stringify([pattern.ports, reading, pattern.machine]);
  if (signature === lastPortSignature) return;
  lastPortSignature = signature;
  machineRead.hidden = !pattern.machine;
  if (pattern.machine) {
    const info = pattern.machine, decoded = readLifeMachine(info, reading);
    machineRead.replaceChildren(); const title = document.createElement("h2"); title.textContent = "图灵机读数"; machineRead.append(title);
    for (const line of decoded ? [`第 ${decoded.step} 拍 · ${decoded.status}`, `状态 ${decoded.state} · 读写头 ${decoded.head}`, `纸带：${decoded.tape.join(" ")}`, `范围 [${info.left}, ${info.right}] · 每步 ${info.period.toLocaleString()} 代`] : ["等待寄存器采样。", `每个图灵机步骤需要 ${info.period.toLocaleString()} 代。`]) { const p = document.createElement("p"); p.textContent = line; machineRead.append(p); }
    const links = document.createElement("div"); links.className = "control-row";
    for (const [label, id] of [["状态信号", info.registers.state[0]], ["纸带信号", info.registers.tape[Math.max(0, (decoded?.head ?? info.left) - info.left)][0]], ["空间信号", info.registers.fault]]) {
      const button = document.createElement("button"); button.textContent = label; button.onclick = () => { const port = pattern.ports.find(p => p.id === id); if (port) locate(port); }; links.append(button);
    }
    machineRead.append(links);
  }
  for (const kind of ["input", "output"] as const) {
    const list = el(`life-${kind}s`); list.replaceChildren();
    const ports = pattern.ports.filter(port => port.kind === kind && !(pattern.machine && port.id.startsWith("tm-")));
    if (!ports.length) { const p = document.createElement("p"); p.className = "hint"; p.textContent = pattern.machine ? kind === "input" ? "初始纸带已编码在反馈寄存器中；修改输入后重新转换。" : "寄存器输出已解码到上方，可点击信号按钮定位。" : kind === "input" ? "暂无输入；选择“放置输入”在画布添加。" : "暂无输出；选择“放置输出”在画布添加。"; list.append(p); }
    for (const port of ports) {
      const row = document.createElement("div"); row.className = "port-row";
      const name = document.createElement("button"); name.className = "port-name"; name.textContent = port.label; name.title = `${shapeLabel[port.shape]} (${port.x}, ${port.y})，点击定位`; name.onclick = () => locate(port);
      const value = document.createElement(kind === "input" ? "button" : "span"); value.className = `port-value ${displayValue(port) === "1" ? "on" : ""}`; value.textContent = displayValue(port); value.dataset.portId = port.id;
      value.setAttribute("aria-label", `${port.label}，当前 ${displayValue(port)}`);
      if (kind === "input") value.onclick = () => { pause(); markUndo(); el("life-notice").classList.remove("error"); send({ type: "toggle", portId: port.id }); };
      const remove = document.createElement("button"); remove.className = "port-remove"; remove.textContent = "×"; remove.title = "移除端口标记，保留细胞"; remove.setAttribute("aria-label", `移除端口 ${port.label}`); remove.onclick = () => { pause(); markUndo(); send({ type: "remove-port", portId: port.id }); };
      row.append(name, value, remove); list.append(row);
    }
  }
  text("life-reading", pattern.sampling ? reading ? `最近采样：第 ${reading.generation.toLocaleString()} 代；每 ${pattern.sampling.period} 代一次。` : `等待传播：第 ${pattern.sampling.start.toLocaleString()} 代开始采样，每 ${pattern.sampling.period} 代一次。` : reading ? `检测于第 ${reading.generation.toLocaleString()} 代；显示当前相位。` : "输出显示实际细胞，不提前计算答案。");
}
function size() { return { width: board.clientWidth, height: board.clientHeight }; }
function fit(): void {
  const points = [...pattern.cells];
  for (const p of pattern.ports) { points.push([p.x, p.y], [p.x + (p.shape === "glider" ? 13 : 4), p.y + (p.shape === "glider" ? 13 : 4)]); }
  const b = lifeBounds(points);
  if (!b) { camera = { x: 0, y: 0, scale: 20 }; renderSoon(); return; }
  const { width, height } = size();
  camera = { x: (b.minX + b.maxX + 1) / 2, y: (b.minY + b.maxY + 1) / 2, scale: Math.max(.01, Math.min(24, (width - 80) / (b.maxX - b.minX + 1), (height - 80) / (b.maxY - b.minY + 1))) };
  renderSoon(); persist();
}
function renderSoon(): void { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); }
function render(): void {
  const { width, height } = size(), dpr = window.devicePixelRatio || 1;
  if (board.width !== Math.round(width * dpr) || board.height !== Math.round(height * dpr)) { board.width = Math.round(width * dpr); board.height = Math.round(height * dpr); }
  context.setTransform(dpr, 0, 0, dpr, 0, 0); context.fillStyle = "#0d1825"; context.fillRect(0, 0, width, height);
  const s = camera.scale, left = camera.x - width / (2 * s), top = camera.y - height / (2 * s);
  if (s >= 8) {
    context.strokeStyle = "#ffffff0d"; context.lineWidth = 1; context.beginPath();
    for (let x = Math.floor(left); (x - left) * s < width; x++) { const px = Math.round((x - left) * s) + .5; context.moveTo(px, 0); context.lineTo(px, height); }
    for (let y = Math.floor(top); (y - top) * s < height; y++) { const py = Math.round((y - top) * s) + .5; context.moveTo(0, py); context.lineTo(width, py); }
    context.stroke();
  }
  context.fillStyle = "#a4e5c7";
  const gap = s >= 5 ? 1 : 0;
  for (const [x, y] of pattern.cells) {
    const px = (x - left) * s, py = (y - top) * s;
    if (px + s < 0 || py + s < 0 || px > width || py > height) continue;
    context.fillRect(Math.floor(px), Math.floor(py), Math.max(1, s - gap), Math.max(1, s - gap));
  }
  for (const port of pattern.ports) {
    const dx = port.shape === "glider" ? 10 : 0, dy = dx, side = port.shape === "cell" ? 1 : port.shape === "glider" ? 3 : port.shape === "lwss" ? 5 : 4;
    const x = (port.x + dx - left) * s, y = (port.y + dy - top) * s;
    if (x > width + 200 || y > height + 100 || x + side * s < -200 || y + side * s < -100) continue;
    const color = port.kind === "input" ? "#79bbff" : "#ffd17e";
    context.strokeStyle = color; context.lineWidth = 2; context.strokeRect(x - 3, y - 3, Math.max(5, side * s + 5), Math.max(5, (port.shape === "lwss" ? 4 : side) * s + 5));
    context.font = "bold 13px 'Segoe UI', sans-serif"; const label = `${port.label}  ${displayValue(port)}`; const labelWidth = context.measureText(label).width + 12;
    context.fillStyle = "#0d1825e8"; context.fillRect(x - 3, y - 25, labelWidth, 20); context.fillStyle = color; context.fillText(label, x + 3, y - 11);
  }
  text("life-zoom", `${s < .2 ? (s / 20 * 100).toFixed(2) : Math.round(s / 20 * 100)}%`);
}
function zoom(factor: number, px = board.clientWidth / 2, py = board.clientHeight / 2): void {
  const { width, height } = size(), old = camera.scale, next = Math.min(64, Math.max(.01, old * factor));
  camera.x += (px - width / 2) * (1 / old - 1 / next); camera.y += (py - height / 2) * (1 / old - 1 / next); camera.scale = next; renderSoon(); persist();
}
new ResizeObserver(renderSoon).observe(board);
board.addEventListener("wheel", event => { event.preventDefault(); const rect = board.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
const pointers = new Map<number, { x: number; y: number }>();
let drag: { x: number; y: number; moving: boolean; last?: LifePoint } | undefined;
function point(event: PointerEvent): LifePoint {
  const rect = board.getBoundingClientRect(); return [Math.floor(camera.x + (event.clientX - rect.left - rect.width / 2) / camera.scale), Math.floor(camera.y + (event.clientY - rect.top - rect.height / 2) / camera.scale)];
}
function paint(to: LifePoint): void {
  const from = drag?.last ?? to, count = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  const cells: LifePoint[] = [];
  for (let i = 0; i <= count; i++) cells.push([Math.round(from[0] + (to[0] - from[0]) * i / (count || 1)), Math.round(from[1] + (to[1] - from[1]) * i / (count || 1))]);
  if (drag) drag.last = to;
  send({ type: "paint", cells, alive: field("life-tool") !== "erase" });
}
board.addEventListener("pointerdown", event => {
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); board.setPointerCapture(event.pointerId);
  if (pointers.size > 1) { drag = undefined; return; }
  const moving = field("life-tool") === "pan" || event.button === 1 || event.button === 2 || heldSpace;
  drag = { x: event.clientX, y: event.clientY, moving };
  if (moving) return;
  pause(); markUndo(); el("life-notice").classList.remove("error");
  const [x, y] = point(event), tool = field("life-tool");
  if (tool === "input" || tool === "output") {
    const index = pattern.ports.filter(p => p.kind === tool).length + 1;
    send({ type: "port", port: { id: crypto.randomUUID(), kind: tool, label: `${tool === "input" ? "I" : "O"}${index}`, x, y, shape: field("life-shape") as LifeShape, value: 0 } }); drag = undefined;
  } else paint([x, y]);
});
board.addEventListener("pointermove", event => {
  const previous = pointers.get(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!event.buttons && event.pointerType !== "touch") pointers.delete(event.pointerId);
  const [x, y] = point(event); text("life-position", `坐标 (${x}, ${y})`);
  if (pointers.size === 2 && previous) {
    const other = [...pointers].find(([id]) => id !== event.pointerId)![1], before = Math.hypot(previous.x - other.x, previous.y - other.y), after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
    if (before > 0) { const rect = board.getBoundingClientRect(); zoom(after / before, (event.clientX + other.x) / 2 - rect.left, (event.clientY + other.y) / 2 - rect.top); } return;
  }
  if (!drag) return;
  if (drag.moving) { camera.x -= (event.clientX - drag.x) / camera.scale; camera.y -= (event.clientY - drag.y) / camera.scale; drag.x = event.clientX; drag.y = event.clientY; renderSoon(); persist(); }
  else if (!drag.last || drag.last[0] !== x || drag.last[1] !== y) paint([x, y]);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) board.addEventListener(type, event => { pointers.delete((event as PointerEvent).pointerId); drag = undefined; });
board.addEventListener("contextmenu", event => event.preventDefault());
window.addEventListener("keydown", event => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement || el<HTMLDialogElement>("life-import-dialog").open || document.querySelector("dialog[open]")) return; if (event.code === "Space") { event.preventDefault(); heldSpace = true; } });
window.addEventListener("keyup", event => { if (event.code === "Space") heldSpace = false; });
window.addEventListener("blur", () => { heldSpace = false; drag = undefined; pointers.clear(); });

el("life-tool").addEventListener("change", () => {
  const tool = field("life-tool"), select = el<HTMLSelectElement>("life-shape");
  select.hidden = tool !== "input" && tool !== "output";
  const choices: LifeShape[] = tool === "input" ? ["eater", "cell"] : ["cell", "glider", "lwss"];
  select.replaceChildren(...choices.map(value => new Option(shapeLabel[value], value)));
  board.style.cursor = tool === "pan" ? "grab" : "crosshair";
});
el("life-run").onclick = () => { if (running || advancing) { pause(); text("life-notice", "已暂停。"); return; } running = true; debt = 0; rateStart = lastTick = performance.now(); rateGeneration = pattern.generation; el("life-notice").classList.remove("error"); text("life-notice", "正在按 B3/S23 连续演化。"); controls(); };
el("life-step").onclick = () => { pause(); send({ type: "advance", amount: 1 }); };
el("life-advance").onclick = () => {
  const amount = Number(field("life-amount"));
  if (!Number.isSafeInteger(amount) || amount < 1) { text("life-notice", "前进代数必须为正整数。"); return; }
  pause(); advancing = true; text("life-notice", "正在后台演化，可随时取消。"); send({ type: "advance", amount });
};
el("life-cancel").onclick = () => { pause(); text("life-notice", "已取消，保留已完成的代数。"); };
machineStep.onclick = () => {
  if (!pattern.machine) return;
  const period = pattern.machine.period; pause(); advancing = true;
  send({ type: "advance", amount: period - pattern.generation % period });
};
el("life-reset").onclick = () => { pause(); markUndo(); rateGeneration = seed.generation; send({ type: "reset" }); text("life-notice", "已回到载入图案时的起点。"); };
el("life-clear").onclick = () => { markUndo(); load(emptyLife()); text("life-notice", "已清空，可以撤销编辑。"); };
el("life-undo").onclick = () => { if (!undo) return; const previous = undo; undo = undefined; load(previous.pattern, previous.seed, false); text("life-notice", "已撤销上一次编辑。"); };
el("life-load-preset").onclick = () => { markUndo(); const preset = lifePresets[field("life-preset")]; load(preset.make()); text("life-preset-note", preset.note); text("life-notice", `已载入${preset.name}。`); };
el("life-fit").onclick = fit; el("life-origin").onclick = () => { camera.x = camera.y = 0; renderSoon(); persist(); };
el("life-zoom-in").onclick = () => zoom(1.5); el("life-zoom-out").onclick = () => zoom(1 / 1.5);
el("life-speed").addEventListener("change", () => { const input = el<HTMLInputElement>("life-speed"); input.value = String(Math.max(1, Math.min(1000, Number(input.value) || 20))); persist(); });
setInterval(() => {
  const now = performance.now(), elapsed = now - lastTick; lastTick = now;
  if (!running) return;
  const speed = Math.max(1, Math.min(1000, Number(field("life-speed")) || 20)); debt = Math.min(speed * 2, debt + Math.min(elapsed, 250) * speed / 1000);
  if (!busy && debt >= 1) { const amount = Math.min(128, Math.floor(debt)); debt -= amount; send({ type: "advance", amount }); }
}, 16);

const importDialog = el<HTMLDialogElement>("life-import-dialog");
el("life-import").onclick = () => { text("life-import-error", ""); importDialog.showModal(); el("life-source").focus(); };
el("life-close-import").onclick = () => importDialog.close();
function importText(source: string): void {
  const next = parseLife(source), document = source.trimStart().startsWith("{") ? JSON.parse(source) : undefined;
  const initial = document?.seed ? validateLife(document.seed) : next;
  markUndo(); load(next, initial); importDialog.close();
  text("life-preset-note", next.ports.length ? `已读取 ${next.ports.length} 个输入、输出端口。图案按 B3/S23 运行。` : "已导入自定义图案，按 B3/S23 运行。"); text("life-notice", "导入完成，原图案可通过撤销编辑恢复。");
}
el("life-import-form").addEventListener("submit", event => { event.preventDefault(); try { importText(el<HTMLTextAreaElement>("life-source").value); } catch (error) { text("life-import-error", error instanceof Error ? error.message : "导入失败。"); } });
el("life-choose-file").onclick = () => el<HTMLInputElement>("life-file").click();
el("life-file").addEventListener("change", async () => {
  const input = el<HTMLInputElement>("life-file"), file = input.files?.[0]; if (!file) return;
  try { if (file.size > 100_000_000) throw new Error("文件超过 100 MB。"); importText(await file.text()); }
  catch (error) { text("life-import-error", error instanceof Error ? error.message : "文件导入失败。"); }
  finally { input.value = ""; }
});
el("life-export").onclick = () => requestDownload("conway-life.rle", lifeRLE(pattern), "text/plain");
el("life-save").onclick = () => requestDownload("conway-life.json", lifeJSON(pattern, seed), "application/json");
window.addEventListener("pagehide", saveNow);

const machineDialog = el<HTMLDialogElement>("life-machine-dialog"), machineDraftKey = `${STORAGE}.machine-source`;
const defaultMachine: MachineProjectFields = { input: "", blankSymbol: "_", initialState: "q0", haltStates: "H", acceptStates: "T", rejectStates: "F", rules: "q0,_->H,1,N" };
let compiler: Worker | undefined;
const machineSource = () => Object.fromEntries(editorFields.map(key => [key, field(`life-tm-${key}`)])) as unknown as MachineProjectFields;
function fillMachine(source: MachineProjectFields): void { for (const key of editorFields) el<HTMLInputElement>(`life-tm-${key}`).value = source[key]; }
function saveMachineDraft(): void { try { localStorage.setItem(machineDraftKey, JSON.stringify({ source: machineSource(), left: field("life-tm-left"), right: field("life-tm-right") })); } catch { /* The editable source remains available. */ } }
fillMachine(defaultMachine);
try { const saved = JSON.parse(localStorage.getItem(machineDraftKey) ?? "null"); if (saved && editorFields.every(key => typeof saved.source?.[key] === "string")) { fillMachine(saved.source); el<HTMLInputElement>("life-tm-left").value = saved.left; el<HTMLInputElement>("life-tm-right").value = saved.right; } } catch { /* Start with the working one-cell example. */ }
el("life-machine-form").addEventListener("input", saveMachineDraft);
convertButton.onclick = () => { text("life-machine-error", ""); machineDialog.showModal(); };
el("life-machine-close").onclick = () => machineDialog.close();
function adjustMachineRange(source: MachineProjectFields): void { el<HTMLInputElement>("life-tm-left").value = "-1"; el<HTMLInputElement>("life-tm-right").value = String(Math.max(1, [...source.input].length)); }
el("life-machine-read-lab").onclick = () => {
  try { const source = loadEditorDraft(localStorage) ?? loadProject(localStorage, "turing-machine-simulator.project.v1"); if (!source) throw new Error("实验台还没有可读取的草稿。"); fillMachine(source); adjustMachineRange(source); saveMachineDraft(); text("life-machine-progress", "已读取实验台草稿，不会覆盖实验台内容。"); }
  catch (error) { text("life-machine-error", error instanceof Error ? error.message : "读取失败。"); }
};
el("life-machine-example").onclick = () => { fillMachine(defaultMachine); el<HTMLInputElement>("life-tm-left").value = el<HTMLInputElement>("life-tm-right").value = "0"; saveMachineDraft(); };
el("life-machine-import").onclick = () => el<HTMLInputElement>("life-machine-file").click();
el("life-machine-file").addEventListener("change", async () => {
  const input = el<HTMLInputElement>("life-machine-file"), file = input.files?.[0]; if (!file) return;
  try { if (file.size > 20_000_000) throw new Error("图灵机项目超过 20 MB。"); const source = parseProjectJson(await file.text()); fillMachine(source); adjustMachineRange(source); saveMachineDraft(); text("life-machine-progress", "已导入机器，检查纸带范围后转换。"); }
  catch (error) { text("life-machine-error", error instanceof Error ? error.message : "机器导入失败。"); }
  finally { input.value = ""; }
});
function compilerControls(): void { el<HTMLButtonElement>("life-machine-compile").disabled = !!compiler; el("life-machine-cancel").hidden = !compiler; }
el("life-machine-cancel").onclick = () => { compiler?.terminate(); compiler = undefined; compilerControls(); text("life-machine-progress", "已取消转换，画布保持不变。"); };
el("life-machine-form").addEventListener("submit", event => {
  event.preventDefault(); if (compiler) return; saveMachineDraft();
  text("life-machine-error", ""); text("life-machine-progress", "正在后台构建逻辑门和反馈线路，可以取消，也可以关闭窗口继续使用画布。");
  compiler = new Worker(new URL("./life-machine-worker.ts", import.meta.url), { type: "module" }); compilerControls();
  compiler.onmessage = ({ data }: MessageEvent<{ error?: string; pattern?: LifePattern }>) => {
    compiler?.terminate(); compiler = undefined; compilerControls();
    if (data.error || !data.pattern) { text("life-machine-error", data.error ?? "转换没有生成图案。"); return; }
    markUndo(); load(data.pattern); machineDialog.close();
    const info = data.pattern.machine!;
    text("life-preset-note", `图灵机已编译为 ${info.stats.gates} 个逻辑门、${info.stats.registers} 个反馈寄存器。使用“图灵机一步”推进完整周期，输出从实际飞船信号读取。`);
    text("life-notice", `转换完成：${data.pattern.cells.length.toLocaleString()} 个活细胞；纸带范围 [${info.left}, ${info.right}]。`);
  };
  compiler.onerror = () => { compiler?.terminate(); compiler = undefined; compilerControls(); text("life-machine-error", "转换 Worker 意外停止，请缩小机器或纸带范围后重试。"); };
  compiler.postMessage({ source: machineSource(), left: Number(field("life-tm-left")), right: Number(field("life-tm-right")) });
});
busy = true; controls();
void readLifeSession().then(saved => {
  if (!saved || latest) return;
  pattern = validateLife(saved.pattern); seed = validateLife(saved.seed); storageReadable = true;
  if (saved.camera && [saved.camera.x, saved.camera.y, saved.camera.scale].every(Number.isFinite) && saved.camera.scale >= .01 && saved.camera.scale <= 64) { camera = saved.camera; fitAfterLoad = false; restoreCamera = true; }
  el<HTMLInputElement>("life-speed").value = String(Math.max(1, Math.min(1000, saved.speed || 20)));
  text("life-preset-note", "已恢复上次的图案、端口、机器读数与重置起点。");
}).catch(() => { /* The legacy small-pattern save remains available. */ }).finally(() => {
  if (latest) return;
  if (!restoreCamera) renderSoon();
  rateGeneration = pattern.generation; send({ type: "load", pattern, seed });
});
setInterval(() => { if (running) void saveNow(); }, 5000);
