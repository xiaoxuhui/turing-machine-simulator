import { LIFE_SHAPES, emptyLife, type LifePattern, type LifePoint, type LifePort, type LifeReading } from "./life";
import { FastLifeWorld } from "./life-fast";
import { validateLife } from "./life-format";

export type LifeRequest = { id: number } & (
  | { type: "load"; pattern: LifePattern; seed?: LifePattern }
  | { type: "advance"; amount: number }
  | { type: "cancel" | "reset" }
  | { type: "paint"; cells: LifePoint[]; alive: boolean }
  | { type: "port"; port: LifePort }
  | { type: "remove-port" | "toggle"; portId: string }
);
export type LifeResponse =
  | { type: "state"; id: number; pattern: LifePattern; reading: LifeReading | null; completed?: number; remaining?: number }
  | { type: "error"; id: number; message: string };
const scope = self as unknown as { onmessage: ((event: MessageEvent<LifeRequest>) => void) | null; postMessage(message: LifeResponse): void };
let pattern = emptyLife(), seed = emptyLife(), world = new FastLifeWorld(pattern), job = 0, reading: LifeReading | null = null;
function read(): void {
  const { sampling } = pattern;
  if (sampling && (world.generation < sampling.start || (world.generation - sampling.start) % sampling.period !== 0)) return;
  reading = { generation: world.generation, values: Object.fromEntries(pattern.ports.filter(p => p.kind === "output").map(p => [p.id, world.read(p)])) };
}
function changed(): void {
  reading = null;
  if (pattern.sampling) {
    const earliest = world.generation + (seed.sampling?.start || seed.sampling?.period || 0), period = pattern.sampling.period;
    pattern.sampling.start = earliest + (((seed.sampling?.start ?? 0) - earliest) % period + period) % period;
  }
  read();
}
function report(id: number, completed?: number, remaining?: number): void {
  pattern.cells = world.points(); pattern.generation = world.generation;
  for (const port of pattern.ports) if (port.kind === "input" && port.shape === "cell") port.value = world.read(port);
  scope.postMessage({ type: "state", id, pattern, reading, completed, remaining });
}
scope.onmessage = async ({ data }) => {
  const token = ++job;
  try {
    switch (data.type) {
      case "load": {
        const loaded = validateLife(data.pattern), initial = validateLife(data.seed ?? data.pattern);
        const nextWorld = new FastLifeWorld(loaded);
        pattern = loaded; seed = initial; world = nextWorld; reading = null; read(); break;
      }
      case "reset": pattern = structuredClone(seed); world = new FastLifeWorld(pattern); reading = null; read(); break;
      case "cancel": break;
      case "paint": for (const [x, y] of data.cells) world.set(x, y, data.alive); changed(); break;
      case "port": {
        const port = validateLife({ ...emptyLife(), ports: [data.port] }).ports[0];
        if (pattern.ports.some(p => p.id === port.id)) throw new Error("端口名称已存在。");
        if (port.kind === "input" && port.shape === "eater") {
          for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (world.get(port.x + x, port.y + y)) throw new Error("这里已有活细胞，请在空白处放置食者开关。");
          for (const [dx, dy] of port.switchCells ?? LIFE_SHAPES.eater) world.set(port.x + dx, port.y + dy, true);
        }
        pattern.ports.push(port); changed(); break;
      }
      case "remove-port": pattern.ports = pattern.ports.filter(p => p.id !== data.portId); changed(); break;
      case "toggle": {
        const port = pattern.ports.find(p => p.id === data.portId);
        if (!port) throw new Error("没有找到输入端口。");
        world.toggle(port); changed(); break;
      }
      case "advance": {
        if (!Number.isSafeInteger(data.amount) || data.amount < 1) throw new Error("前进代数必须为正整数。");
        let completed = 0, lastReport = performance.now();
        while (completed < data.amount && token === job) {
          let amount = Math.min(8192, data.amount - completed);
          if (pattern.sampling) {
            const { start, period } = pattern.sampling;
            const untilSample = world.generation < start ? start - world.generation : period - (world.generation - start) % period;
            amount = Math.min(amount, untilSample);
          }
          world.advance(amount); read(); completed += amount;
          if (completed === data.amount || performance.now() - lastReport > 150) { report(data.id, completed, data.amount - completed); lastReport = performance.now(); }
          if (completed < data.amount) await new Promise(resolve => setTimeout(resolve, 0));
        }
        return;
      }
    }
    report(data.id);
  } catch (error) { scope.postMessage({ type: "error", id: data.id, message: error instanceof Error ? error.message : "生命游戏运行失败。" }); }
};
