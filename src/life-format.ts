import { emptyLife, lifeBounds, type LifeMachineInfo, type LifePattern, type LifePoint, type LifePort, type LifeShape } from "./life";

const MAX_CELLS = 4_000_000;
const coordinate = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) < 2 ** 40;
function validatePorts(value: unknown): LifePort[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("输入输出端列表无效。");
  const ids = new Set<string>();
  return value.map(port => {
    if (!port || typeof port !== "object" || typeof port.id !== "string" || !port.id || ids.has(port.id)
      || typeof port.label !== "string" || port.label.length > 200 || !coordinate(port.x) || !coordinate(port.y)
      || !["input", "output"].includes(port.kind) || ![0, 1].includes(port.value)
      || !(port.kind === "input" ? ["cell", "eater"] : ["cell", "glider", "lwss"]).includes(port.shape)) throw new Error("输入输出端的类型、坐标或名称无效。");
    if (port.switchCells !== undefined && (!Array.isArray(port.switchCells) || port.switchCells.length !== 7 || port.switchCells.some((p: unknown) => !Array.isArray(p) || p.length !== 2 || !p.every(n => Number.isInteger(n) && n >= 0 && n < 4)) || new Set(port.switchCells.map((p: LifePoint) => p.join(","))).size !== 7)) throw new Error("食者开关图案无效。");
    ids.add(port.id);
    return { id: port.id, kind: port.kind, label: port.label, x: port.x, y: port.y, shape: port.shape, value: port.value, ...(port.switchCells ? { switchCells: port.switchCells } : {}) };
  });
}
export function validateLife(value: unknown): LifePattern {
  if (!value || typeof value !== "object") throw new Error("生命游戏存档无效。");
  const data = value as LifePattern;
  if (!Array.isArray(data.cells) || data.cells.length > MAX_CELLS || data.cells.some(p => !Array.isArray(p) || p.length !== 2 || !coordinate(p[0]) || !coordinate(p[1]))) throw new Error("细胞坐标无效，或图案超过 400 万个活细胞。");
  if (!Number.isSafeInteger(data.generation) || data.generation < 0) throw new Error("代数必须是非负整数。");
  if (data.sampling && (!Number.isSafeInteger(data.sampling.start) || data.sampling.start < 0 || !Number.isSafeInteger(data.sampling.period) || data.sampling.period < 1)) throw new Error("输出采样代数无效。");
  if (data.comments !== undefined && (!Array.isArray(data.comments) || data.comments.some(line => typeof line !== "string"))) throw new Error("图案注释无效。");
  const cells = data.cells;
  const ports = validatePorts(data.ports ?? []);
  return { cells, generation: data.generation, ports, sampling: data.sampling, comments: data.comments ?? [], machine: data.machine === undefined ? undefined : validateMachine(data.machine, ports) };
}
function validateMachine(value: LifeMachineInfo, ports: LifePort[]): LifeMachineInfo {
  const names = (a: unknown): a is string[] => Array.isArray(a) && a.length > 0 && a.every(n => typeof n === "string");
  const ids = new Set(ports.filter(p => p.kind === "output" && p.shape === "lwss").map(p => p.id));
  if (!value || value.version !== 1 || !Number.isInteger(value.left) || !Number.isInteger(value.right) || value.left > 0 || value.right < 0 || value.right - value.left + 1 > 64
    || !Number.isSafeInteger(value.period) || value.period < 1 || !names(value.states) || value.states.length > 64 || !names(value.symbols) || value.symbols.length > 32
    || !Array.isArray(value.terminal) || value.terminal.length !== value.states.length || value.terminal.some(t => t !== null && !["halt", "accept", "reject"].includes(t))
    || !Array.isArray(value.rules) || value.rules.length !== value.states.length || value.rules.some(row => !Array.isArray(row) || row.length !== value.symbols.length || row.some(v => typeof v !== "boolean"))
    || !value.registers || !names(value.registers.state) || value.registers.state.length !== Math.max(1, Math.ceil(Math.log2(value.states.length))) || !names(value.registers.head) || value.registers.head.length !== value.right - value.left + 1
    || !Array.isArray(value.registers.tape) || value.registers.tape.length !== value.registers.head.length || value.registers.tape.some(row => !names(row) || row.length !== Math.max(1, Math.ceil(Math.log2(value.symbols.length))))
    || [...value.registers.state, ...value.registers.head, ...value.registers.tape.flat(), value.registers.fault].some(id => !ids.has(id))
    || !value.source || ["input", "blankSymbol", "initialState", "haltStates", "acceptStates", "rejectStates", "rules"].some(key => typeof value.source[key as keyof typeof value.source] !== "string")) throw new Error("图灵机图案的寄存器说明无效。");
  return value;
}
function logicPorts(lines: string[]): Pick<LifePattern, "ports" | "sampling"> {
  const ports: LifePort[] = [];
  const lwss = lines.some(line => line.includes("eastbound lightweight spaceship"));
  let sampling: LifePattern["sampling"];
  for (const line of lines) {
    const input = line.match(/^#C Input (.+) = ([01]) at \((-?\d+),\s*(-?\d+)\) \(switch eater: ([^)]{1,80})\)/);
    if (input) {
      const switchCells = parseLife(`x=4,y=4,rule=B3/S23\n${input[5]}`).cells;
      ports.push({ id: `in-${ports.length}`, label: input[1], value: Number(input[2]) as 0 | 1, x: Number(input[3]), y: Number(input[4]), kind: "input", shape: "eater", switchCells });
    }
    const output = line.match(/^#C (.+) at \((-?\d+),\s*(-?\d+)\)$/);
    if (output && !/^(?:Input |NAND |Feedback )/.test(output[1])) ports.push({ id: `out-${ports.length}`, label: output[1], x: Number(output[2]), y: Number(output[3]), kind: "output", shape: lwss ? "lwss" : "glider", value: 0 });
    const timed = line.match(/Sample the output probes at generation 0 and every (\d+) generations/);
    const settled = line.match(/Sample every (\d+) generations after generation (\d+)/);
    const glider = line.match(/After about (\d+) generations, look for moving gliders/);
    if (timed) sampling = { start: 0, period: Number(timed[1]) };
    if (settled) sampling = { start: Number(settled[2]), period: Number(settled[1]) };
    if (glider) sampling = { start: Number(glider[1]), period: 60 };
  }
  return { ports, sampling };
}
export function parseLife(text: string): LifePattern {
  if (text.length > 100_000_000) throw new Error("导入文本超过 100 MB。");
  if (text.trimStart().startsWith("{")) {
    const data = JSON.parse(text);
    if (data.format !== "conway-life" || data.version !== 1) throw new Error("这不是本页的生命游戏 JSON 存档。");
    return validateLife(data.pattern);
  }
  const lines = text.replace(/\r/g, "").split("\n").map(line => line.trim());
  const header = lines.find(line => /^x\s*=/.test(line));
  if (!header) {
    const rows = lines.filter(line => !line.startsWith("!") && !line.startsWith("#"));
    if (!rows.some(line => /[O*1]/.test(line)) || rows.some(line => /[^.O*01\s]/.test(line))) throw new Error("请粘贴 RLE，或只用 O、*、1 表示活细胞、.、0 表示死细胞的逐行图案。");
    const pattern = emptyLife();
    rows.forEach((row, y) => [...row.replace(/\s/g, "")].forEach((c, x) => { if (/[O*1]/.test(c)) pattern.cells.push([x, y]); }));
    return validateLife(pattern);
  }
  const dimensions = header.match(/^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)(?:\s*,\s*rule\s*=\s*(\S+))?\s*$/i);
  if (!dimensions) throw new Error("RLE 首行应为 x = 宽度, y = 高度, rule = B3/S23。");
  if (dimensions[3] && !["B3/S23", "23/3", "LIFE", "CONWAYLIFE"].includes(dimensions[3].toUpperCase())) throw new Error("本页只运行 B3/S23；不能把其他规则的图案按生命游戏导入。");
  const position = lines.find(line => /^#CXRLE\b/.test(line));
  const origin = position?.match(/Pos=(-?\d+),(-?\d+)/), generation = position?.match(/Gen=(\d+)/);
  const ox = Number(origin?.[1] ?? 0), oy = Number(origin?.[2] ?? 0);
  const body = lines.filter(line => line && !line.startsWith("#") && line !== header).join("").replace(/\s/g, "");
  if (!body || !/^(?:(?:[1-9]\d*)?[bo.$A])*!?$/.test(body)) throw new Error("RLE 数据仅支持 b、o、.、A、$ 与结尾 !；重复次数必须为正整数。");
  const cells: LifePoint[] = [];
  let x = 0, y = 0;
  for (const [, digits, token] of body.matchAll(/(\d*)([bo.$A!])/g)) {
    const count = Number(digits || 1);
    if (!Number.isSafeInteger(count)) throw new Error("RLE 重复次数过大。");
    if (token === "!") break;
    if (token === "$") { y += count; x = 0; }
    else if (token === "b" || token === ".") x += count;
    else {
      if (cells.length + count > MAX_CELLS) throw new Error("图案超过 400 万个活细胞，请缩小导入范围。");
      for (let n = 0; n < count; n++) cells.push([ox + x++, oy + y]);
    }
    if (!coordinate(ox + x) || !coordinate(oy + y)) throw new Error("RLE 坐标超出支持范围。");
  }
  const metadata = lines.find(line => line.startsWith("#C LIFE-PORTS "));
  const logic = logicPorts(lines);
  const saved = metadata ? JSON.parse(metadata.slice("#C LIFE-PORTS ".length)) : logic;
  return validateLife({ cells, generation: Number(generation?.[1] ?? 0), ports: saved.ports, sampling: saved.sampling, machine: saved.machine,
    comments: lines.filter(line => line.startsWith("#") && !line.startsWith("#CXRLE") && !line.startsWith("#C LIFE-PORTS ")) });
}
export function lifeRLE(pattern: LifePattern): string {
  const bounds = lifeBounds(pattern.cells), x0 = bounds?.minX ?? 0, y0 = bounds?.minY ?? 0;
  const rows = new Map<number, number[]>();
  for (const [x, y] of pattern.cells) { const row = rows.get(y) ?? []; row.push(x); rows.set(y, row); }
  const parts: string[] = [], run = (count: number, token: string) => { if (count > 0) parts.push(`${count === 1 ? "" : count}${token}`); };
  let previousY = y0;
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    run(y - previousY, "$"); previousY = y;
    const xs = [...new Set(rows.get(y)!)].sort((a, b) => a - b);
    let position = x0;
    for (let i = 0; i < xs.length;) {
      run(xs[i] - position, "b");
      let j = i + 1; while (j < xs.length && xs[j] === xs[j - 1] + 1) j++;
      run(j - i, "o"); position = xs[j - 1] + 1; i = j;
    }
  }
  parts.push("!");
  const body: string[] = []; let row = "";
  for (const token of parts) { if (row.length + token.length > 70) { body.push(row); row = ""; } row += token; } body.push(row);
  return [`#CXRLE Pos=${x0},${y0} Gen=${pattern.generation}`, ...pattern.comments.map(line => line.startsWith("#") ? line : `#C ${line}`),
    `#C LIFE-PORTS ${JSON.stringify({ ports: pattern.ports, sampling: pattern.sampling, machine: pattern.machine })}`,
    `x = ${bounds ? bounds.maxX - x0 + 1 : 0}, y = ${bounds ? bounds.maxY - y0 + 1 : 0}, rule = B3/S23`, ...body, ""].join("\n");
}
export function lifeJSON(pattern: LifePattern, seed?: LifePattern): string { return JSON.stringify({ format: "conway-life", version: 1, pattern, seed }, null, 2); }
export const shapeLabel: Record<LifeShape, string> = { cell: "单格", eater: "食者开关", glider: "滑翔机", lwss: "轻型飞船" };
