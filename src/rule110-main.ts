import "./rule110-styles.css";
import { editorFields, loadEditorDraft } from "./editor-draft";
import { loadProject, parseProjectJson } from "./project-codec";
import { attachSpaceIndentation } from "./text-insertion";
import { attachRuleDiagnostics } from "./rule-diagnostics";
import { parseTransitions } from "./core";
import { packWords, unpackWords, wordPreview, type PackedWords } from "./rule110-word";
import type { Compiled110 } from "./rule110-compiler";
import type { MachineProjectFields } from "./project-state";
import { requestDownload } from "./download";
import { rule110Bit } from "./rule110";
import { GOLLY_RULE110, golly110Rule } from "./rule110-golly";

const KEY = "turing-machine-simulator.rule110-draft.v1";
const defaultSource: MachineProjectFields = { input: "111", blankSymbol: "_", initialState: "q0", haltStates: "H", acceptStates: "T", rejectStates: "F", rules: "q0,1->q0,1,R\nq0,_->H,1,N" };
document.querySelector<HTMLDivElement>("#rule110-app")!.innerHTML = `
  <header><a href="./">← 图灵机实验台</a><div><small>TM → TAG → CTS → RULE 110</small><h1>图灵机 → 规则 110</h1></div><nav><a href="./life.html">康威生命游戏</a> · <a href="./campaign.html">教学关卡</a></nav></header>
  <main>
    <section class="panel intro"><h2>把规则变成初始图案</h2><p>转换生成左侧无限周期、中央有限数据、右侧无限周期。之后只按规则 110 更新相邻三个格子，无需再执行图灵机。</p><p>使用 Cook 2009 §1 的构造。压缩重复段可保存极长的配置；转换和预览在后台运行，可随时取消。</p></section>
    <section class="panel rule-definition"><div class="heading"><h2>运行规则 · 110</h2><div class="actions"><label class="golly-rule-label">Golly 规则名<input id="gollyRule" value="${GOLLY_RULE110}" readonly aria-label="Golly 规则名" /></label><button id="copyGollyRule">复制规则名</button></div></div>
      <p>每次同时读取“左格、当前格、右格”，按下表写入当前格的新值。规则始终是 110；不同图灵机改变的是初始图案。</p>
      <div class="rule-truth" aria-label="规则 110 八种邻域变化">${Array.from({ length: 8 }, (_, index) => { const n = 7 - index; return `<div><code>${n.toString(2).padStart(3, "0")}</code><span>↓</span><strong>${rule110Bit(n >> 2, n >> 1 & 1, n & 1)}</strong></div>`; }).join("")}</div>
      <p class="hint" id="ruleCopyStatus" role="status">默认使用 W110:T实际宽度,0：左右相连，高度无限；宽度包含保护背景。转换后自动填写，可直接复制到 Golly。无限平面模式则使用 W110。</p>
    </section>
    <section class="panel machine"><div class="heading"><h2>1 · 输入图灵机</h2><div class="actions"><button id="readLab">读取实验台草稿</button><button id="importMachine">导入项目</button><button id="useExample">一进制加一示例</button></div></div>
      <p class="hint">这里的编辑独立保存，不覆盖实验台或关卡草稿。支持已有的函数、通配规则和原地移动。</p>
      <div class="fields"><label class="wide">初始输入<input id="input" spellcheck="false" /></label><label>空白符<input id="blankSymbol" /></label><label>初始状态<input id="initialState" /></label><label>停止状态<input id="haltStates" /></label><label>接受状态<input id="acceptStates" /></label><label>拒绝状态<input id="rejectStates" /></label></div>
      <label for="rules">转移规则</label><textarea id="rules" rows="8" spellcheck="false"></textarea><p id="draftStatus" class="hint" role="status"></p><p id="errors" class="error" role="alert"></p>
      <div class="actions"><button id="compile" class="primary">转换为规则 110</button><button id="cancel" hidden>取消后台任务</button></div><p id="progress" role="status" aria-live="polite">填写规则后开始转换。</p>
      <input id="machineFile" type="file" accept=".json,application/json" hidden />
    </section>
    <section class="panel result"><div class="heading"><h2>2 · 转换结果</h2><div class="actions"><button id="export110" disabled>保存本页配置（JSON）</button><button id="import110">恢复本页配置（JSON）</button></div></div>
      <p id="resultStatus" class="hint">还没有转换结果。</p><div id="stats" class="stats"></div>
      <div class="words"><label>左周期<small id="leftLength"></small><textarea id="leftBits" rows="3" readonly></textarea></label><label>中央数据<small id="centerLength"></small><textarea id="centerBits" rows="3" readonly></textarea></label><label>右周期<small id="rightLength"></small><textarea id="rightBits" rows="3" readonly></textarea></label></div>
      <p class="hint">上方只展示各段开头 240 位。JSON 保存完整的重复结构，不截断；Golly 的导出范围见下方。坐标 0 是中央数据的第一格，负坐标按左周期重复。</p><input id="configFile" type="file" accept=".json,application/json" hidden />
      <div class="golly-export"><h3>导出给 Golly</h3><div class="fields golly-fields"><label>图案范围<select id="gollyFormat"><option value="macrocell">全部中央数据 · Macrocell (.mc)</option><option value="rle">当前视窗 · RLE (.rle)</option></select></label><label>边界<select id="gollyTopology"><option value="cylinder">左右环绕 · :T宽度,0</option><option value="unbounded">无限平面 · W110</option></select></label><label>保护步数<input id="gollySteps" type="number" min="0" max="4096" value="256" /></label><button id="exportGolly" disabled>导出 Golly 图案</button></div>
        <p class="hint">文件自带上方显示的实际规则名，Golly 可直接打开。.mc 保留全部中央数据；.rle 使用下方的视窗位置和显示格数。两侧补足“保护步数”所需的周期背景，在这段代数内与本页无限背景一致。环绕图案按 Golly 的边界居中放置，坐标映射写在文件注释中；初始行下方是后续各代。</p><p id="gollyStatus" class="hint" role="status"></p>
      </div>
    </section>
    <section class="panel simulation"><div class="heading"><h2>3 · 纯规则 110 演化</h2><span id="generation">尚未预览</span></div>
      <div class="fields preview-fields"><label>视窗左端坐标<input id="origin" value="0" inputmode="numeric" /></label><label>显示格数<input id="width" type="number" min="16" max="2048" value="640" /></label><label>预览步数<input id="steps" type="number" min="0" max="4096" value="256" /></label></div>
      <div class="actions"><button id="preview" class="primary" disabled>生成全部预览</button><button id="single" disabled>单步</button><button id="lookCenter" disabled>中央起点</button><button id="lookRight" disabled>右周期起点</button><button id="lookLeft" disabled>左侧周期边界</button></div>
      <p class="hint">黑色为 1，白色为 0；从上到下每行是一代，不跳步。边界按实际因果范围计算，不把两端接成环。预览步数控制观察窗口，不限制转换出的机器。</p>
      <div class="canvas-scroll"><canvas id="spaceTime" width="640" height="257" aria-label="规则 110 时空图"></canvas></div><p id="previewStatus" class="hint" role="status"></p>
    </section>
    <details class="panel"><summary>转换原理与结果的含义</summary><ol><li>展开图灵机函数与通配规则。原地移动编译成“向右一步，再向左一步”。</li><li>按 Cook §1.2，把有限状态和符号转换成删除数为 s 的标签系统，用整数重复次数表示纸带。</li><li>按 §1.3，标签采用独热编码，并补足空追加项，得到循环标签系统。</li><li>按 §1.4，拼接论文图 1、2 的 A–L 位图块。接缝相位闭合后，得到左右周期与中央字串。</li></ol><p>这里使用的是论文中较简单的指数开销构造。即使原图灵机只有几步，规则 110 中也可能需要很长时间。左右周期由压缩配置完整表示。</p><p>规则 110 本身不会整幅停住。原机器停机对应论文的 F 滑翔子信号；此页提供初始配置和元胞演化，不把后台算出的图灵机答案作为元胞结果。</p><p><a href="https://arxiv.org/abs/0906.3248" target="_blank" rel="noopener noreferrer">Matthew Cook · A Concrete View of Rule 110 Computation（2009）</a></p></details>
  </main>`;

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const value = (id: string) => byId<HTMLInputElement | HTMLTextAreaElement>(id).value;
const source = (): MachineProjectFields => Object.fromEntries(editorFields.map(field => [field, value(field)])) as unknown as MachineProjectFields;
const diagnostics = attachRuleDiagnostics(byId<HTMLTextAreaElement>("rules"));
attachSpaceIndentation(byId<HTMLTextAreaElement>("rules"));
let worker: Worker | undefined, ticket = 0, busy = false, compiled: { packed: PackedWords; stats?: Compiled110["stats"]; source?: MachineProjectFields } | undefined;
let lastGeneration = 0, compiledKey = "", compileKey = "", stale = false;
const setText = (id: string, text: string) => { byId(id).textContent = text; };
function buttons(): void {
  byId<HTMLButtonElement>("compile").disabled = busy;
  byId("cancel").hidden = !busy;
  for (const id of ["export110", "exportGolly", "preview", "single", "lookCenter", "lookRight", "lookLeft"]) byId<HTMLButtonElement>(id).disabled = !compiled || busy || stale;
  updateGollyRule();
}
function updateGollyRule(): void {
  const input = byId<HTMLInputElement>("gollyRule"), topology = value("gollyTopology") as "unbounded" | "cylinder";
  let rule = "", explanation = "转换后自动计算宽度";
  try {
    if (topology === "unbounded") rule = GOLLY_RULE110;
    else {
      const guard = Number(value("gollySteps")), width = Number(value("width"));
      if (!Number.isSafeInteger(guard) || guard < 0 || guard > 4096) throw new Error("保护步数须为 0–4096");
      const length = value("gollyFormat") === "rle" ? Number.isSafeInteger(width) && width > 0 ? BigInt(width) : undefined
        : compiled ? BigInt(compiled.packed.nodes[compiled.packed.roots[1]].length) : undefined;
      if (length !== undefined) rule = golly110Rule(length + 2n * BigInt(guard), topology);
    }
  } catch (error) { explanation = error instanceof Error ? error.message : "规则宽度无效"; }
  input.value = rule; input.placeholder = explanation; input.title = rule || explanation;
  byId<HTMLButtonElement>("copyGollyRule").disabled = !rule;
  byId<HTMLButtonElement>("exportGolly").disabled = !compiled || busy || stale || !rule;
}
function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(source())); setText("draftStatus", "本页草稿已自动保存。"); }
  catch { setText("draftStatus", "本页草稿未能保存，请复制规则或导出项目。"); }
  stale = Boolean(compiled && compiledKey !== JSON.stringify(source()));
  if (stale) setText("resultStatus", "输入已修改；请重新转换。下方仍保留上次结果。");
  buttons();
}
function fill(project: MachineProjectFields): void { for (const field of editorFields) byId<HTMLInputElement>(field).value = project[field]; persist(); }
for (const field of editorFields) byId(field).addEventListener("input", persist);
let restored = defaultSource;
try { const data = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (data && editorFields.every(field => typeof data[field] === "string")) restored = data; } catch { /* Start with the editable example. */ }
fill(restored);

function showCompiled(): void {
  if (!compiled) return;
  const [left, center, right] = unpackWords(compiled.packed);
  for (const [id, word] of [["left", left], ["center", center], ["right", right]] as const) {
    setText(`${id}Length`, `${word.length.toLocaleString("en-US")} 位`);
    byId<HTMLTextAreaElement>(`${id}Bits`).value = wordPreview(word, 240);
  }
  const stats = compiled.stats;
  byId("stats").replaceChildren();
  if (stats) for (const [label, number] of [["规范化状态", stats.states], ["符号", stats.symbols], ["标签", stats.tagSymbols], ["循环追加项", stats.appendants]]) {
    const item = document.createElement("div"); item.textContent = `${label} · ${number}`; byId("stats").append(item);
  }
  setText("resultStatus", stale ? "后台已完成旧输入的转换；当前输入已变化，请重新转换。" : "已生成可独立演化的规则 110 初始配置。完整重复段保存在压缩数据中。");
  lastGeneration = 0; setText("generation", "初始配置 · 第 0 代"); buttons();
}
function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./rule110-worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("error", () => { worker?.terminate(); worker = undefined; busy = false; setText("progress", "后台任务意外停止，可重新转换或预览。"); buttons(); });
  worker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data; if (data.id !== ticket) return;
    if (data.type === "progress") setText("progress", data.text);
    if (data.type === "compiled") {
      compiled = { packed: data.packed, stats: data.stats, source: data.source }; compiledKey = compileKey;
      stale = compiledKey !== JSON.stringify(source()); busy = false;
      setText("progress", "转换完成。可导出压缩配置，或在下方预览。"); showCompiled();
    }
    if (data.type === "rows") {
      const canvas = byId<HTMLCanvasElement>("spaceTime"), context = canvas.getContext("2d")!;
      for (let offset = 0; offset < data.rows.length; offset++) {
        const row: Uint8Array = data.rows[offset], image = context.createImageData(row.length, 1);
        for (let index = 0; index < row.length; index++) { const color = row[index] ? 24 : 255; image.data.set([color, color, color, 255], index * 4); }
        context.putImageData(image, 0, data.start + offset);
      }
      lastGeneration = data.start + data.rows.length - 1; setText("generation", `第 0～${lastGeneration} 代 · 每行一代`);
      setText("previewStatus", `已生成 ${lastGeneration + 1} 行。`);
    }
    if (data.type === "previewed") { busy = false; setText("previewStatus", `预览完成，共 ${data.rows} 行；全部由规则 110 更新生成。`); buttons(); }
    if (data.type === "golly") {
      busy = false; buttons(); setText("gollyStatus", `已生成 Golly ${data.rule} 图案：${data.cells} 格${data.nodes ? `，${data.nodes} 个压缩节点` : ""}。`);
      requestDownload(`rule110-golly.${data.extension}`, data.text, "text/plain");
    }
    if (data.type === "error") { busy = false; setText("progress", data.text); setText("previewStatus", data.text); setText("gollyStatus", data.text); buttons(); }
  });
  return worker;
}
byId("compile").addEventListener("click", () => {
  const project = source(), options = { haltStates: project.haltStates.split(","), acceptStates: project.acceptStates.split(","), rejectStates: project.rejectStates.split(",") };
  const parsed = parseTransitions(project.rules, options); diagnostics.update(parsed.errors);
  setText("errors", parsed.errors.slice(0, 4).join("；")); if (parsed.errors.length) return;
  busy = true; compileKey = JSON.stringify(project); buttons(); setText("progress", "正在后台转换……可继续编辑输入，或返回实验台。");
  getWorker().postMessage({ type: "compile", id: ++ticket, project });
});
byId("cancel").addEventListener("click", () => { worker?.terminate(); worker = undefined; ++ticket; busy = false; setText("progress", "任务已取消；输入和已有转换结果已保留。"); setText("gollyStatus", "后台任务已取消。"); buttons(); });
function preview(steps: number): void {
  if (!compiled || busy || stale) return;
  const width = Number(value("width"));
  if (!/^-?\d+$/.test(value("origin")) || !Number.isInteger(width) || width < 16 || width > 2048 || !Number.isInteger(steps) || steps < 0 || steps > 4096) { setText("previewStatus", "坐标须为整数，显示格数 16–2048，预览步数 0–4096。"); return; }
  const canvas = byId<HTMLCanvasElement>("spaceTime"); canvas.width = width; canvas.height = steps + 1;
  canvas.getContext("2d")!.fillStyle = "#fff"; canvas.getContext("2d")!.fillRect(0, 0, width, steps + 1);
  busy = true; buttons(); setText("previewStatus", "正在按真实因果范围计算……");
  getWorker().postMessage({ type: "preview", id: ++ticket, packed: compiled.packed, origin: value("origin"), width, steps });
}
byId("preview").addEventListener("click", () => preview(Number(value("steps"))));
byId("single").addEventListener("click", () => preview(lastGeneration + 1));
for (const [id, origin] of [["lookCenter", () => 0n], ["lookRight", () => unpackWords(compiled!.packed)[1].length], ["lookLeft", () => -unpackWords(compiled!.packed)[0].length]] as const) byId(id).addEventListener("click", () => { byId<HTMLInputElement>("origin").value = String(origin()); preview(Number(value("steps"))); });
byId("readLab").addEventListener("click", () => {
  try {
    const saved = loadProject(localStorage, "turing-machine-simulator.project.v1"), draft = loadEditorDraft(localStorage);
    if (!saved && !draft) throw new Error("还没有实验台草稿。");
    fill({ ...defaultSource, ...saved, ...draft }); setText("progress", "已读取实验台当前保存的输入和规则；实验台原稿保持原样。");
  } catch (error) { setText("errors", error instanceof Error ? error.message : "读取失败。"); }
});
byId("useExample").addEventListener("click", () => fill(defaultSource));
byId("importMachine").addEventListener("click", () => byId<HTMLInputElement>("machineFile").click());
byId("machineFile").addEventListener("change", async () => {
  const input = byId<HTMLInputElement>("machineFile"), file = input.files?.[0]; input.value = ""; if (!file) return;
  try { if (file.size > 20000000) throw new Error("项目文件超过 20 MB。"); fill(parseProjectJson(await file.text())); setText("progress", "已导入图灵机项目。"); }
  catch (error) { setText("errors", error instanceof Error ? error.message : "导入失败。"); }
});
byId("export110").addEventListener("click", () => { if (compiled) void requestDownload("rule110-configuration.json", JSON.stringify({ format: "turing-machine-rule110", version: 1, construction: "Cook2009-section1", ...compiled }), "application/json"); });
byId("gollyRule").addEventListener("click", () => byId<HTMLInputElement>("gollyRule").select());
byId("copyGollyRule").addEventListener("click", async () => {
  const rule = value("gollyRule"); if (!rule) return;
  try { await navigator.clipboard.writeText(rule); setText("ruleCopyStatus", `已复制 ${rule}，在 Golly 的规则设置中粘贴即可。`); }
  catch { byId<HTMLInputElement>("gollyRule").select(); setText("ruleCopyStatus", "可选中规则名后按 Ctrl+C 复制。"); }
});
for (const id of ["gollyFormat", "gollyTopology", "gollySteps", "width"]) byId(id).addEventListener("input", updateGollyRule);
byId("exportGolly").addEventListener("click", () => {
  if (!compiled || busy || stale) return;
  const width = Number(value("width")), steps = Number(value("gollySteps"));
  if (!/^-?\d+$/.test(value("origin")) || !Number.isInteger(width) || width < 16 || width > 2048 || !Number.isInteger(steps) || steps < 0 || steps > 4096) { setText("gollyStatus", "坐标须为整数，显示格数 16–2048，保护步数 0–4096。"); return; }
  busy = true; buttons(); setText("gollyStatus", "正在后台生成 Golly 图案，可随时取消……");
  getWorker().postMessage({ type: "golly", id: ++ticket, mode: value("gollyFormat"), topology: value("gollyTopology"), packed: compiled.packed, origin: value("origin"), width, steps });
});
byId("import110").addEventListener("click", () => byId<HTMLInputElement>("configFile").click());
byId("configFile").addEventListener("change", async () => {
  const input = byId<HTMLInputElement>("configFile"), file = input.files?.[0]; input.value = ""; if (!file) return;
  try {
    if (file.size > 50000000) throw new Error("配置文件超过 50 MB。");
    const data = JSON.parse(await file.text());
    if (data.format !== "turing-machine-rule110" || data.version !== 1) throw new Error("不是此页面支持的规则 110 配置。");
    const words = unpackWords(data.packed);
    if (words.length !== 3 || !words[0].length || !words[2].length || data.packed.nodes.some((node: { kind: string; text: string }) => node.kind === "text" && /[^01]/.test(node.text))) throw new Error("配置须有左周期、中央数据、右周期三个二进制字串。");
    worker?.terminate(); worker = undefined; ++ticket; busy = false;
    if (data.source && editorFields.every(field => typeof data.source[field] === "string")) fill(data.source);
    compiled = { packed: packWords(words), source: data.source, stats: data.stats }; compiledKey = JSON.stringify(source()); stale = false; showCompiled(); setText("progress", "已导入完整规则 110 配置，无需重新转换即可演化。");
  } catch (error) { setText("errors", error instanceof Error ? error.message : "配置导入失败。"); }
});
